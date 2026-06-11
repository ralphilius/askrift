import { NormalizedEvent } from '../common';

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

export type PolarSubscriptionCreated = NormalizedEvent<PolarWebhookPayload>;
export type PolarSubscriptionUpdated = NormalizedEvent<PolarWebhookPayload>;
export type PolarSubscriptionCancelled = NormalizedEvent<PolarWebhookPayload>;
export type PolarPaymentSucceeded = NormalizedEvent<PolarWebhookPayload>;
export type PolarPaymentFailed = NormalizedEvent<PolarWebhookPayload>;
export type PolarPaymentRefunded = NormalizedEvent<PolarWebhookPayload>;
