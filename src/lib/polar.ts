import Askrift from './askrift';
import { SUBSCRIPTION_EVENT_TYPES } from '../types/events';
import type { NormalizedSubscriptionEvent, SubscriptionEventType } from '../types/events';
import { fromRaw } from './request';
import type { InternalRequest } from './request';
import {
  getHeader,
  getRawBody,
  hmacSha256Base64,
  isPostJsonOrForm,
  parseBody,
  timingSafeEqualString,
} from './utils';
import {
  PolarPaymentFailed,
  PolarPaymentRefunded,
  PolarPaymentSucceeded,
  PolarSubscriptionCancelled,
  PolarSubscriptionCreated,
  PolarSubscriptionUpdated,
  PolarWebhookPayload,
} from '../types/polar/subscription';
import { extractStableEventId, isEventFresh } from './idempotency';
import type { EventTimestampValidationOptions, NormalizedWebhookEvent } from './idempotency';

export type PolarOptions = {
  publicKey?: string;
  debug?: boolean;
};

const POLAR_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const EVENT_MAP: Record<string, string[]> = {
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated]: ['subscription.created'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated]: ['subscription.updated', 'subscription.uncanceled', 'subscription.active'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled]: ['subscription.revoked'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded]: ['order.paid'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentFailed]: ['subscription.past_due'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentRefunded]: ['order.refunded', 'refund.created', 'refund.updated'],
};

const REFUND_COMPLETED_STATUSES = new Set(['succeeded', 'refunded', 'paid', 'partially_refunded']);
const ALL_EVENTS = Object.keys(EVENT_MAP);
const ALL_PROVIDER_EVENTS = Array.from(new Set(Object.values(EVENT_MAP).flat()));
const REFUND_EVENTS = EVENT_MAP[SUBSCRIPTION_EVENT_TYPES.PaymentRefunded];

function isRefundCompleted(payload: PolarWebhookPayload): boolean {
  const status = (payload.data as any)?.status;
  if (typeof status !== 'string') return true;
  return REFUND_COMPLETED_STATUSES.has(status.toLowerCase());
}

function getEventTypeForPayload(payload: PolarWebhookPayload): SubscriptionEventType | null {
  const eventName = payload.type;
  if (!eventName) return null;
  for (const [type, names] of Object.entries(EVENT_MAP)) {
    if (names.includes(eventName)) return type as SubscriptionEventType;
  }
  return null;
}

function getBody(req: InternalRequest): PolarWebhookPayload | null {
  return parseBody<PolarWebhookPayload>(req);
}

export default class Polar extends Askrift<'polar'> {
  private _req: InternalRequest;
  private _secret: string;

  constructor(req: InternalRequest, options: PolarOptions | boolean = {}) {
    const polarOptions = typeof options === "boolean" ? { debug: options } : options;
    super(polarOptions.debug);
    this._secret = process.env.POLAR_WEBHOOK_SECRET || "";
    if (!this._secret) throw new Error('POLAR_WEBHOOK_SECRET is required');
    this._req = fromRaw(req);
  }

  onSubscriptionCreated(): Promise<(PolarSubscriptionCreated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated) as unknown as Promise<(PolarSubscriptionCreated & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionCanceled(): Promise<(PolarSubscriptionCancelled & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled) as unknown as Promise<(PolarSubscriptionCancelled & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionUpdated(): Promise<(PolarSubscriptionUpdated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated) as unknown as Promise<(PolarSubscriptionUpdated & NormalizedWebhookEvent) | null>;
  }

  onPaymentSucceeded(): Promise<(PolarPaymentSucceeded & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded) as unknown as Promise<(PolarPaymentSucceeded & NormalizedWebhookEvent) | null>;
  }

  onPaymentFailed(): Promise<(PolarPaymentFailed & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.PaymentFailed) as unknown as Promise<(PolarPaymentFailed & NormalizedWebhookEvent) | null>;
  }

  onPaymentRefunded(): Promise<(PolarPaymentRefunded & NormalizedWebhookEvent) | null> {
    return this.getRefundEvent() as unknown as Promise<(PolarPaymentRefunded & NormalizedWebhookEvent) | null>;
  }

  validRequest(): boolean {
    return isPostJsonOrForm(this._req);
  }

  verify(): boolean {
    const id = getHeader(this._req.headers, 'webhook-id');
    const timestamp = getHeader(this._req.headers, 'webhook-timestamp');
    const signatureHeader = getHeader(this._req.headers, 'webhook-signature');
    if (!id || !timestamp || !signatureHeader) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > POLAR_TIMESTAMP_TOLERANCE_SECONDS) return false;
    const signed = `${id}.${timestamp}.${getRawBody(this._req)}`;
    const secret = this._secret.startsWith('whsec_')
      ? Buffer.from(this._secret.slice(6), 'base64')
      : Buffer.from(this._secret, 'utf8');
    const signatures = signatureHeader.split(' ').map((signature) => signature.replace(/^v1,/, ''));
    return signatures.some((signature) => timingSafeEqualString(signature, hmacSha256Base64(secret, signed)));
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
    const data = payload.data || {};
    const webhookId = getHeader(this._req.headers, 'webhook-id');
    return {
      type,
      provider: 'polar',
      eventId: webhookId || data.id || null,
      subscriptionId: data.subscription_id || (payload.type?.startsWith('subscription.') ? data.id : null) || null,
      customerId: data.customer_id || data.customer?.id || null,
      customerEmail: data.customer?.email || null,
      productId: data.product_id || null,
      amount: typeof data.amount === 'number'
        ? data.amount
        : typeof data.refunded_amount === 'number'
          ? data.refunded_amount
          : typeof data.total_amount === 'number'
            ? data.total_amount
            : null,
      currency: data.currency || null,
      occurredAt: data.modified_at || data.created_at || null,
      raw: payload,
    } as unknown as NormalizedSubscriptionEvent<unknown>;
  }

  getIdempotencyKey(): string | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const eventId = extractStableEventId('polar', payload);
    return eventId ? `polar:${eventId}` : null;
  }

  getEventTimestamp(): Date | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const data = payload.data || {};
    const timestamp = data.modified_at || data.created_at;
    if (typeof timestamp !== 'string') return null;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  isFresh(options: EventTimestampValidationOptions): boolean | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    return isEventFresh('polar', payload, options);
  }

  isSupportedEventType(type: string): boolean {
    return ALL_PROVIDER_EVENTS.includes(type);
  }

  protected parseProviderEvent(): import("../lib/askrift").AskriftParsedEvent | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const type = getEventTypeForPayload(payload);
    if (!type) return null;
    return {
      eventType: type,
      payload: payload as unknown as import("../lib/askrift").AskriftParsedEvent["payload"],
      provider: "polar",
      providerEventType: payload.type,
      aliases: payload.type ? [payload.type] : [],
    };
  }

  private async getEventForType(type: SubscriptionEventType): Promise<(NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent) | null> {
    try {
      if (!this.verify()) return null;
      const payload = getBody(this._req);
      const eventNames = EVENT_MAP[type];
      if (!payload || !eventNames || !eventNames.includes(payload.type || '')) return null;
      const event = this.toNormalizedEvent();
      if (!event || event.type !== type) return null;
      return event as unknown as (NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent);
    } catch (error) {
      this.debug(error);
      return null;
    }
  }

  private async getRefundEvent(): Promise<(PolarPaymentRefunded & NormalizedWebhookEvent) | null> {
    try {
      if (!this.verify()) return null;
      const payload = getBody(this._req);
      if (!payload || !REFUND_EVENTS.includes(payload.type || '')) return null;
      if (!isRefundCompleted(payload)) return null;
      const event = this.toNormalizedEvent();
      if (!event || event.type !== SUBSCRIPTION_EVENT_TYPES.PaymentRefunded) return null;
      return event as unknown as (PolarPaymentRefunded & NormalizedWebhookEvent);
    } catch (error) {
      this.debug(error);
      return null;
    }
  }
}
