import { NormalizedEventByType } from '../events';

export interface PolarWebhookPayload {
  type?: string;
  data?: {
    id?: string;
    customer_id?: string;
    customer?: {
      id?: string;
      email?: string;
      [key: string]: unknown;
    };
    subscription_id?: string;
    product_id?: string;
    amount?: number;
    total_amount?: number;
    currency?: string;
    created_at?: string;
    modified_at?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type PolarSubscriptionCreated = NormalizedEventByType<'subscription.created', PolarWebhookPayload>;
export type PolarSubscriptionUpdated = NormalizedEventByType<'subscription.updated', PolarWebhookPayload>;
export type PolarSubscriptionCancelled = NormalizedEventByType<'subscription.cancelled', PolarWebhookPayload>;
export type PolarSubscriptionPaused = NormalizedEventByType<'subscription.paused', PolarWebhookPayload>;
export type PolarPaymentSucceeded = NormalizedEventByType<'payment.succeeded', PolarWebhookPayload>;
export type PolarPaymentFailed = NormalizedEventByType<'payment.failed', PolarWebhookPayload>;
export type PolarPaymentRefunded = NormalizedEventByType<'payment.refunded', PolarWebhookPayload>;
