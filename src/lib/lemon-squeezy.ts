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
  LemonSqueezyPaymentFailed,
  LemonSqueezyPaymentRefunded,
  LemonSqueezyPaymentSucceeded,
  LemonSqueezySubscriptionCancelled,
  LemonSqueezySubscriptionCreated,
  LemonSqueezySubscriptionPaused,
  LemonSqueezySubscriptionUpdated,
  LemonSqueezyWebhookPayload,
} from '../types/lemon-squeezy/subscription';
import { extractStableEventId, isEventFresh } from './idempotency';
import type { EventTimestampValidationOptions, NormalizedWebhookEvent } from './idempotency';

export type LemonSqueezyOptions = {
  publicKey?: string;
  debug?: boolean;
};

const EVENT_MAP: Record<string, string[]> = {
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated]: ['subscription_created'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated]: ['subscription_updated', 'subscription_resumed', 'subscription_unpaused'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled]: ['subscription_expired'],
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionPaused]: ['subscription_paused'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded]: ['subscription_payment_success', 'subscription_payment_recovered'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentFailed]: ['subscription_payment_failed'],
  [SUBSCRIPTION_EVENT_TYPES.PaymentRefunded]: ['order_refunded', 'refund_created', 'subscription_payment_refunded'],
};

const ALL_EVENTS = [
  SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated,
  SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated,
  SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled,
  SUBSCRIPTION_EVENT_TYPES.SubscriptionPaused,
  SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded,
  SUBSCRIPTION_EVENT_TYPES.PaymentFailed,
  SUBSCRIPTION_EVENT_TYPES.PaymentRefunded,
];

const ALL_PROVIDER_EVENTS = Array.from(new Set(Object.values(EVENT_MAP).flat()));

function getEventTypeForPayload(payload: LemonSqueezyWebhookPayload): SubscriptionEventType | null {
  const eventName = payload.meta?.event_name;
  if (!eventName) return null;
  for (const [type, names] of Object.entries(EVENT_MAP)) {
    if (names.includes(eventName)) return type as SubscriptionEventType;
  }
  return null;
}

function getBody(req: InternalRequest): LemonSqueezyWebhookPayload | null {
  return parseBody<LemonSqueezyWebhookPayload>(req);
}

export default class LemonSqueezy extends Askrift<'lemon-squeezy'> {
  private _req: InternalRequest;
  private _secret: string;

  constructor(req: InternalRequest, options: LemonSqueezyOptions | boolean = {}) {
    const lemonOptions = typeof options === "boolean" ? { debug: options } : options;
    super(lemonOptions.debug);
    this._secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
    if (!this._secret) throw new Error('LEMON_SQUEEZY_WEBHOOK_SECRET is required');
    this._req = fromRaw(req);
  }

  onSubscriptionCreated(): Promise<(LemonSqueezySubscriptionCreated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated) as unknown as Promise<(LemonSqueezySubscriptionCreated & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionCanceled(): Promise<(LemonSqueezySubscriptionCancelled & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled) as unknown as Promise<(LemonSqueezySubscriptionCancelled & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionPaused(): Promise<(LemonSqueezySubscriptionPaused & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionPaused) as unknown as Promise<(LemonSqueezySubscriptionPaused & NormalizedWebhookEvent) | null>;
  }

  onSubscriptionUpdated(): Promise<(LemonSqueezySubscriptionUpdated & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated) as unknown as Promise<(LemonSqueezySubscriptionUpdated & NormalizedWebhookEvent) | null>;
  }

  onPaymentSucceeded(): Promise<(LemonSqueezyPaymentSucceeded & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded) as unknown as Promise<(LemonSqueezyPaymentSucceeded & NormalizedWebhookEvent) | null>;
  }

  onPaymentFailed(): Promise<(LemonSqueezyPaymentFailed & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.PaymentFailed) as unknown as Promise<(LemonSqueezyPaymentFailed & NormalizedWebhookEvent) | null>;
  }

  onPaymentRefunded(): Promise<(LemonSqueezyPaymentRefunded & NormalizedWebhookEvent) | null> {
    return this.getEventForType(SUBSCRIPTION_EVENT_TYPES.PaymentRefunded) as unknown as Promise<(LemonSqueezyPaymentRefunded & NormalizedWebhookEvent) | null>;
  }

  validRequest(): boolean {
    return isPostJsonOrForm(this._req);
  }

  verify(): boolean {
    const signature = getHeader(this._req.headers, 'x-signature');
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
    const attributes = payload.data?.attributes || {};
    const isRefund = type === SUBSCRIPTION_EVENT_TYPES.PaymentRefunded;
    const firstOrderItemProductId = (attributes.first_order_item as { product_id?: number | string } | undefined)?.product_id;
    const resolvedProductId = firstOrderItemProductId != null ? firstOrderItemProductId : attributes.product_id;
    const refundedAmount = (attributes as any).refunded_amount;
    const total = (attributes as any).total;

    return {
      type,
      provider: 'lemon-squeezy',
      eventId: payload.data?.id,
      subscriptionId: attributes.subscription_id != null ? String(attributes.subscription_id) : (payload.data?.type === 'subscriptions' ? payload.data?.id || null : null),
      customerId: attributes.customer_id == null ? null : String(attributes.customer_id),
      customerEmail: (attributes as any).user_email || attributes.customer_email || null,
      productId: resolvedProductId == null ? null : String(resolvedProductId),
      amount: isRefund
        ? (typeof refundedAmount === 'number' ? refundedAmount : (typeof total === 'number' ? total : null))
        : (typeof total === 'number' ? total : null),
      currency: attributes.currency || null,
      occurredAt: attributes.updated_at || attributes.created_at || null,
      raw: payload,
    } as unknown as NormalizedSubscriptionEvent<unknown>;
  }

  getIdempotencyKey(): string | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const eventId = extractStableEventId('lemon-squeezy', payload);
    return eventId ? `lemon-squeezy:${eventId}` : null;
  }

  getEventTimestamp(): Date | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    const attributes = payload.data?.attributes || {};
    const timestamp = attributes.updated_at || attributes.created_at;
    if (typeof timestamp !== 'string') return null;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  isFresh(options: EventTimestampValidationOptions): boolean | null {
    if (!this.verify()) return null;
    const payload = getBody(this._req);
    if (!payload) return null;
    return isEventFresh('lemon-squeezy', payload, options);
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
      provider: "lemon-squeezy",
      providerEventType: payload.meta?.event_name,
      aliases: payload.meta?.event_name ? [payload.meta.event_name] : [],
    };
  }

  private async getEventForType(type: SubscriptionEventType): Promise<(NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent) | null> {
    try {
      if (!this.verify()) return null;
      const payload = getBody(this._req);
      const eventNames = EVENT_MAP[type];
      if (!payload || !eventNames || !eventNames.includes(payload.meta?.event_name || '')) return null;
      const event = this.toNormalizedEvent();
      if (!event || event.type !== type) return null;
      return event as unknown as (NormalizedSubscriptionEvent<unknown> & NormalizedWebhookEvent);
    } catch (error) {
      this.debug(error);
      return null;
    }
  }
}
