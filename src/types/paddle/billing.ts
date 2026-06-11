// Paddle Billing webhook payload types.
// Billing notifications are JSON events identified by `event_type` and verified
// with the `Paddle-Signature` HMAC header.

export type PaddleBillingSubscriptionEventType =
  | "subscription.activated"
  | "subscription.canceled"
  | "subscription.created"
  | "subscription.imported"
  | "subscription.past_due"
  | "subscription.paused"
  | "subscription.resumed"
  | "subscription.trialing"
  | "subscription.updated";

export type PaddleBillingTransactionEventType =
  | "transaction.billed"
  | "transaction.canceled"
  | "transaction.completed"
  | "transaction.created"
  | "transaction.paid"
  | "transaction.past_due"
  | "transaction.payment_failed"
  | "transaction.ready"
  | "transaction.revised"
  | "transaction.updated";

export type PaddleBillingEventType = PaddleBillingSubscriptionEventType | PaddleBillingTransactionEventType;

export interface PaddleBillingEventBase<TType extends PaddleBillingEventType = PaddleBillingEventType, TData = Record<string, unknown>> {
  event_id: string;
  event_type: TType;
  occurred_at: string;
  notification_id?: string;
  data: TData;
}

export interface PaddleBillingSubscriptionData {
  id: string;
  status?: "active" | "canceled" | "past_due" | "paused" | "trialing";
  customer_id?: string;
  address_id?: string;
  business_id?: string | null;
  currency_code?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  first_billed_at?: string | null;
  next_billed_at?: string | null;
  paused_at?: string | null;
  canceled_at?: string | null;
  collection_mode?: "automatic" | "manual";
  custom_data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface PaddleBillingTransactionData {
  id: string;
  status?: "billed" | "canceled" | "completed" | "draft" | "paid" | "past_due" | "ready";
  customer_id?: string | null;
  address_id?: string | null;
  business_id?: string | null;
  subscription_id?: string | null;
  currency_code?: string;
  origin?: string;
  created_at?: string;
  updated_at?: string;
  billed_at?: string | null;
  [key: string]: unknown;
}

export type PaddleBillingSubscriptionEvent<TType extends PaddleBillingSubscriptionEventType = PaddleBillingSubscriptionEventType> =
  PaddleBillingEventBase<TType, PaddleBillingSubscriptionData>;

export type PaddleBillingTransactionEvent<TType extends PaddleBillingTransactionEventType = PaddleBillingTransactionEventType> =
  PaddleBillingEventBase<TType, PaddleBillingTransactionData>;

export type PaddleBillingEvent = PaddleBillingSubscriptionEvent | PaddleBillingTransactionEvent;
