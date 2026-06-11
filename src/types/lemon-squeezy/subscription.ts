import { NormalizedEvent } from '../common';

export interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
    [key: string]: unknown;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      customer_id?: number | string;
      customer_email?: string;
      order_id?: number | string;
      product_id?: number | string;
      variant_id?: number | string;
      subscription_id?: number | string;
      total?: number;
      currency?: string;
      created_at?: string;
      updated_at?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LemonSqueezySubscriptionCreated = NormalizedEvent<LemonSqueezyWebhookPayload>;
export type LemonSqueezySubscriptionUpdated = NormalizedEvent<LemonSqueezyWebhookPayload>;
export type LemonSqueezySubscriptionCancelled = NormalizedEvent<LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentSucceeded = NormalizedEvent<LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentFailed = NormalizedEvent<LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentRefunded = NormalizedEvent<LemonSqueezyWebhookPayload>;
