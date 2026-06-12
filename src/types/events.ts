import type { NormalizedWebhookEvent } from "../lib/idempotency";

export const SUBSCRIPTION_EVENT_TYPES = {
  SubscriptionCreated: "subscription.created",
  SubscriptionUpdated: "subscription.updated",
  SubscriptionCancelled: "subscription.cancelled",
  PaymentSucceeded: "payment.succeeded",
  PaymentFailed: "payment.failed",
  PaymentRefunded: "payment.refunded",
} as const;

export type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[keyof typeof SUBSCRIPTION_EVENT_TYPES];

export interface NormalizedEventBase<TType extends SubscriptionEventType = SubscriptionEventType, TRaw = unknown> extends NormalizedWebhookEvent {
  type: TType;
  provider: string;
  raw: TRaw;
  eventId?: string;
  occurredAt?: Date | string;
  subscriptionId?: string;
  subscriptionPlanId?: string;
  customerId?: string;
  customerEmail?: string;
  currency?: string;
  status?: string;
}

export interface NormalizedSubscriptionCreatedEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated, TRaw> {
  nextBillDate?: Date | string;
}

export interface NormalizedSubscriptionUpdatedEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated, TRaw> {
  nextBillDate?: Date | string;
  previousStatus?: string;
  previousSubscriptionPlanId?: string;
}

export interface NormalizedSubscriptionCancelledEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled, TRaw> {
  cancellationEffectiveDate?: Date | string;
}

export interface NormalizedPaymentSucceededEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded, TRaw> {
  paymentId?: string;
  orderId?: string;
  amount?: string;
  nextBillDate?: Date | string;
  receiptUrl?: string;
}

export interface NormalizedPaymentFailedEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.PaymentFailed, TRaw> {
  paymentId?: string;
  orderId?: string;
  amount?: string;
  nextRetryDate?: Date | string;
  attemptNumber?: string;
}

export interface NormalizedPaymentRefundedEvent<TRaw = unknown>
  extends NormalizedEventBase<typeof SUBSCRIPTION_EVENT_TYPES.PaymentRefunded, TRaw> {
  paymentId?: string;
  orderId?: string;
  amount?: string;
  refundType?: string;
  refundReason?: string;
}

export type NormalizedSubscriptionEvent<TRaw = unknown> =
  | NormalizedSubscriptionCreatedEvent<TRaw>
  | NormalizedSubscriptionUpdatedEvent<TRaw>
  | NormalizedSubscriptionCancelledEvent<TRaw>
  | NormalizedPaymentSucceededEvent<TRaw>
  | NormalizedPaymentFailedEvent<TRaw>
  | NormalizedPaymentRefundedEvent<TRaw>;

export type NormalizedEventByType<TType extends SubscriptionEventType, TRaw = unknown> = Extract<
  NormalizedSubscriptionEvent<TRaw>,
  { type: TType }
>;
