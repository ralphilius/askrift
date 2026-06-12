import { NormalizedEvent } from '../common';

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
  [key: string]: unknown;
}

export type GumroadSubscriptionCreated = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadSubscriptionUpdated = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadSubscriptionCancelled = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadSubscriptionPaused = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadPaymentSucceeded = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadPaymentFailed = NormalizedEvent<GumroadWebhookPayload>;
export type GumroadPaymentRefunded = NormalizedEvent<GumroadWebhookPayload>;
