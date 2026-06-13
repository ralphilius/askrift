import { NormalizedEventByType } from '../events';

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
      user_email?: string;
      order_id?: number | string;
      product_id?: number | string;
      variant_id?: number | string;
      subscription_id?: number | string;
      total?: number;
      refunded_amount?: number;
      currency?: string;
      created_at?: string;
      updated_at?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LemonSqueezySubscriptionCreated = NormalizedEventByType<'subscription.created', LemonSqueezyWebhookPayload>;
export type LemonSqueezySubscriptionUpdated = NormalizedEventByType<'subscription.updated', LemonSqueezyWebhookPayload>;
export type LemonSqueezySubscriptionCancelled = NormalizedEventByType<'subscription.cancelled', LemonSqueezyWebhookPayload>;
export type LemonSqueezySubscriptionPaused = NormalizedEventByType<'subscription.paused', LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentSucceeded = NormalizedEventByType<'payment.succeeded', LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentFailed = NormalizedEventByType<'payment.failed', LemonSqueezyWebhookPayload>;
export type LemonSqueezyPaymentRefunded = NormalizedEventByType<'payment.refunded', LemonSqueezyWebhookPayload>;
