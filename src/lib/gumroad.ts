import Askrift from './askrift';
import { SUBSCRIPTION_EVENT_TYPES } from '../types/events';
import type { NormalizedSubscriptionEvent, SubscriptionEventType } from '../types/events';
import { fromRaw } from './request';
import type { InternalRequest } from './request';
import {
  getHeader,
  getRawBody,
  hmacSha256Hex,
  isPostJsonOrForm,
  parseBody,
  timingSafeEqualString,
} from './utils';
import {
  GumroadPaymentFailed,
  GumroadPaymentRefunded,
  GumroadPaymentSucceeded,
  GumroadSubscriptionCancelled,
  GumroadSubscriptionCreated,
  GumroadSubscriptionUpdated,
  GumroadWebhookPayload,
} from '../types/gumroad/subscription';
import { extractStableEventId, isEventFresh } from './idempotency';
import type { EventTimestampValidationOptions, NormalizedWebhookEvent } from './idempotency';

export type GumroadOptions = {
  publicKey?: string;
  debug?: boolean;
};

const EVENT_MAP: Record<string, string[]> = {
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated]: ['sale'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated]: ['subscription_updated', 'subscription_restarted'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled]: ['subscription_ended'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded]: ['sale'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentFailed]: ['dispute'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentRefunded]: ['refund'],
};

const SUBSCRIPTION_EVENTS = [
  SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated,
  SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated,
  SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled,
];

function isTruthyRecurring(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') return false;
    return true;
  }
  return false;
}

function getEventTypeForPayload(payload: GumroadWebhookPayload): SubscriptionEventType | null {
  const resource: string | undefined = payload.resource_name;
  if (!resource) return null;
  for (const [type, names] of Object.entries(EVENT_MAP)) {
    if (names.includes(resource)) return type as SubscriptionEventType;
  }
  return null;
}

function matchesEvent(
  payload: GumroadWebhookPayload,
  type: SubscriptionEventType,
  requireSubscription = false,
  requireNonRecurring = false
): boolean {
  const resource: string | undefined = payload.resource_name;
  if (!resource) return false;
  const names = (EVENT_MAP as Record<string, string[]>)[type];
  if (!names || !names.includes(resource)) return false;
  if (requireSubscription && !payload.subscription_id) return false;
  if (requireNonRecurring && isTruthyRecurring(payload.recurring)) return false;
  return true;
}

function getBody(req: InternalRequest): GumroadWebhookPayload | null {
  return parseBody<GumroadWebhookPayload>(req);
}

function buildEvent(
  payload: GumroadWebhookPayload,
  type: SubscriptionEventType
): NormalizedSubscriptionEvent<unknown> {
  return {
    type,
    provider: 'gumroad',
    eventId: payload.sale_id ?? null,
    subscriptionId: payload.subscription_id ?? null,
    customerId: payload.purchaser_id ?? null,
    customerEmail: payload.email ?? null,
    productId: payload.product_id ?? null,
    amount: payload.price == null ? null : Number(payload.price),
    currency: payload.currency ?? null,
    occurredAt: payload.sale_timestamp ?? null,
    raw: payload,
  } as unknown as NormalizedSubscriptionEvent<unknown>;
}

export default class Gumroad extends Askrift<'gumroad'> {
  private _req: InternalRequest;
  private _secret: string;

  constructor(req: InternalRequest, options: GumroadOptions | boolean = {}) {
    const gumroadOptions = typeof options === 'boolean' ? { debug: options } : options;
    super(gumroadOptions.debug);
    this._secret = process.env.GUMROAD_WEBHOOK_SECRET || '';
    if (!this._secret) throw new Error('GUMROAD_WEBHOOK_SECRET is required');
    this._req = fromRaw(req);
  }

  onSubscriptionCreated(): Promise<(GumroadSubscriptionCreated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated,
      true,
      true
    ) as unknown as Promise<(GumroadSubscriptionCreated & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionCanceled(): Promise<(GumroadSubscriptionCancelled & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled,
      true,
      false
    ) as unknown as Promise<(GumroadSubscriptionCancelled & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionUpdated(): Promise<(GumroadSubscriptionUpdated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated,
      true,
      false
    ) as unknown as Promise<(GumroadSubscriptionUpdated & NormalizedWebhookEvent) | null>;
  }

  onPaymentSucceeded(): Promise<(GumroadPaymentSucceeded & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded,
      false,
      false
    ) as unknown as Promise<(GumroadPaymentSucceeded & NormalizedWebhookEvent) | null>;
  }

  onPaymentFailed(): Promise<(GumroadPaymentFailed & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.PaymentFailed,
      false,
      false
    ) as unknown as Promise<(GumroadPaymentFailed & NormalizedWebhookEvent) | null>;
  }

  onPaymentRefunded(): Promise<(GumroadPaymentRefunded & NormalizedWebhookEvent) | null> {
    return this.getEventForType(
      SUBSCRIPTION_EVENT_TYPES.PaymentRefunded,
      false,
      false
    ) as unknown as Promise<(GumroadPaymentRefunded & NormalizedWebhookEvent) | null>;
  }

  validRequest(): boolean {
    return isPostJsonOrForm(this._req);
  }

  verify(): boolean {
    const signature = getHeader(this._req.headers, 'x-gumroad-signature') || getHeader(this._req.headers, 'x-signature');
    if (!signature) return false;
    const expected = hmacSha256Hex(this._secret, getRawBody(this._req));
    return timingSafeEqualString(signature, expected);
  }

  getEventType(): SubscriptionEventType | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    return getEventTypeForPayload(payload);
  }

  toNormalizedEvent(): NormalizedSubscriptionEvent<unknown> | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const type = getEventTypeForPayload(payload);
    if (!type) return null;
    return buildEvent(payload, type);
  }

  getIdempotencyKey(): string | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    return extractStableEventId('gumroad', payload);
  }

  getEventTimestamp(): Date | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    if (typeof payload.sale_timestamp !== 'string') return null;
    const date = new Date(payload.sale_timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  isFresh(options: EventTimestampValidationOptions): boolean | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    return isEventFresh('gumroad', payload, options);
  }

  isSupportedEventType(type: string): boolean {
    return (SUBSCRIPTION_EVENTS as string[]).includes(type);
  }

  private async getEventForType(
    type: SubscriptionEventType,
    requireSubscription = false,
    requireNonRecurring = false
  ): Promise<(NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent) | null> {
    try {
      if (!this.verify()) return null;
      const payload = getBody(this._req);
      if (!payload || !matchesEvent(payload, type, requireSubscription, requireNonRecurring)) return null;
      const event = buildEvent(payload, type);
      if (!event || event.type !== type) return null;
      return event as unknown as (NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent);
    } catch (error) {
      this.debug(error);
      return null;
    }
  }
}
