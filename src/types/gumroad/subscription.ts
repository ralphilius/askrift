import { NormalizedEventByType, SubscriptionEventType } from '../events';

export type GumroadResourceName =
  | 'sale'
  | 'refund'
  | 'cancellation'
  | 'subscription_ended'
  | 'subscription_restarted'
  | 'subscription_updated'
  | 'dispute'
  | 'dispute_won';

export interface GumroadWebhookPayload {
  resource_name?: GumroadResourceName;
  seller_id?: string;
  product_id?: string;
  product_name?: string;
  permalink?: string;
  product_permalink?: string;
  sale_id?: string;
  sale_timestamp?: string;
  email?: string;
  price?: string | number;
  currency?: string;
  quantity?: string | number;
  purchaser_id?: string;
  subscription_id?: string | null;
  /**
   * Indicates whether the resource is a recurring billing event (renewal) versus
   * a one-time purchase. Accepts booleans or the string forms Gumroad sends in
   * webhook payloads (e.g. "true", "false").
   */
  recurring?: boolean | string | number;
  [key: string]: unknown;
}

export type GumroadEvent<TType extends SubscriptionEventType = SubscriptionEventType> =
  NormalizedEventByType<TType, GumroadWebhookPayload>;

export type GumroadSubscriptionCreated = NormalizedEventByType<'subscription.created', GumroadWebhookPayload>;
export type GumroadSubscriptionUpdated = NormalizedEventByType<'subscription.updated', GumroadWebhookPayload>;
export type GumroadSubscriptionCancelled = NormalizedEventByType<'subscription.cancelled', GumroadWebhookPayload>;
export type GumroadSubscriptionPaused = NormalizedEventByType<'subscription.paused', GumroadWebhookPayload>;
export type GumroadPaymentSucceeded = NormalizedEventByType<'payment.succeeded', GumroadWebhookPayload>;
export type GumroadPaymentFailed = NormalizedEventByType<'payment.failed', GumroadWebhookPayload>;
export type GumroadPaymentRefunded = NormalizedEventByType<'payment.refunded', GumroadWebhookPayload>;
