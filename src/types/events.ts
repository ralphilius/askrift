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

export enum SubscriptionStatus {
  Active = "active",
  Trialing = "trialing",
  PastDue = "past_due",
  Paused = "paused",
  Canceled = "canceled",
  Unpaid = "unpaid",
  Incomplete = "incomplete",
  Expired = "expired",
  Pending = "pending",
  Unknown = "unknown",
}

export enum PaymentStatus {
  Paid = "paid",
  Pending = "pending",
  Failed = "failed",
  Refunded = "refunded",
  PartiallyRefunded = "partially_refunded",
  Canceled = "canceled",
  RequiresAction = "requires_action",
  Unknown = "unknown",
}

export type PaymentProvider = "paddle" | "stripe" | "gumroad";

export interface ProviderStatusFields {
  subscriptionStatus?: string;
  previousSubscriptionStatus?: string;
  paymentStatus?: string;
  eventName?: string;
  refundType?: string;
}

export interface ProviderStatusMetadata {
  name: PaymentProvider;
  subscriptionStatus?: SubscriptionStatus;
  previousSubscriptionStatus?: SubscriptionStatus;
  paymentStatus?: PaymentStatus;
  raw: ProviderStatusFields;
}

export interface NormalizedEvent {
  subscriptionStatus?: SubscriptionStatus;
  previousSubscriptionStatus?: SubscriptionStatus;
  paymentStatus?: PaymentStatus;
  provider: ProviderStatusMetadata;
}

export function mapProviderSubscriptionStatus(
  provider: PaymentProvider,
  status: string | null | undefined,
): SubscriptionStatus | undefined {
  if (!status) return undefined;

  const normalizedStatus = status.toLowerCase();

  switch (provider) {
    case "paddle":
      return mapPaddleSubscriptionStatus(normalizedStatus);
    case "stripe":
      return mapStripeSubscriptionStatus(normalizedStatus);
    case "gumroad":
      return mapGumroadSubscriptionStatus(normalizedStatus);
    default:
      return SubscriptionStatus.Unknown;
  }
}

export function mapProviderPaymentStatus(
  provider: PaymentProvider,
  status: string | null | undefined,
  refundType?: string,
): PaymentStatus | undefined {
  if (!status) return undefined;

  const normalizedStatus = status.toLowerCase();

  switch (provider) {
    case "paddle":
      return mapPaddlePaymentStatus(normalizedStatus, refundType);
    case "stripe":
      return mapStripePaymentStatus(normalizedStatus);
    case "gumroad":
      return mapGumroadPaymentStatus(normalizedStatus);
    default:
      return PaymentStatus.Unknown;
  }
}

function mapPaddleSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.Active;
    case "trialing":
      return SubscriptionStatus.Trialing;
    case "past_due":
      return SubscriptionStatus.PastDue;
    case "paused":
      return SubscriptionStatus.Paused;
    case "deleted":
      return SubscriptionStatus.Canceled;
    default:
      return SubscriptionStatus.Unknown;
  }
}

function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.Active;
    case "trialing":
      return SubscriptionStatus.Trialing;
    case "past_due":
      return SubscriptionStatus.PastDue;
    case "paused":
      return SubscriptionStatus.Paused;
    case "canceled":
      return SubscriptionStatus.Canceled;
    case "unpaid":
      return SubscriptionStatus.Unpaid;
    case "incomplete":
      return SubscriptionStatus.Incomplete;
    case "incomplete_expired":
      return SubscriptionStatus.Expired;
    default:
      return SubscriptionStatus.Unknown;
  }
}

function mapGumroadSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
    case "alive":
      return SubscriptionStatus.Active;
    case "trialing":
      return SubscriptionStatus.Trialing;
    case "past_due":
    case "pending_failure":
    case "failed_payment":
      return SubscriptionStatus.PastDue;
    case "paused":
      return SubscriptionStatus.Paused;
    case "canceled":
    case "cancelled":
    case "ended":
      return SubscriptionStatus.Canceled;
    case "pending":
    case "pending_cancellation":
      return SubscriptionStatus.Pending;
    default:
      return SubscriptionStatus.Unknown;
  }
}

function mapPaddlePaymentStatus(status: string, refundType?: string): PaymentStatus {
  switch (status) {
    case "subscription_payment_succeeded":
    case "payment_succeeded":
    case "paid":
    case "succeeded":
      return PaymentStatus.Paid;
    case "subscription_payment_failed":
    case "payment_failed":
    case "failed":
      return PaymentStatus.Failed;
    case "subscription_payment_refunded":
    case "payment_refunded":
    case "refunded":
      if (refundType === "partial") {
        return PaymentStatus.PartiallyRefunded;
      }
      return PaymentStatus.Refunded;
    case "pending":
      return PaymentStatus.Pending;
    case "canceled":
    case "cancelled":
      return PaymentStatus.Canceled;
    default:
      return PaymentStatus.Unknown;
  }
}

function mapStripePaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case "succeeded":
    case "paid":
    case "charge.succeeded":
    case "invoice.payment_succeeded":
      return PaymentStatus.Paid;
    case "processing":
    case "pending":
      return PaymentStatus.Pending;
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "requires_capture":
      return PaymentStatus.RequiresAction;
    case "payment_failed":
    case "invoice.payment_failed":
    case "failed":
      return PaymentStatus.Failed;
    case "charge.refunded":
    case "refunded":
      return PaymentStatus.Refunded;
    case "canceled":
    case "cancelled":
      return PaymentStatus.Canceled;
    default:
      return PaymentStatus.Unknown;
  }
}

function mapGumroadPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case "paid":
    case "successful":
    case "sale":
    case "sale.created":
      return PaymentStatus.Paid;
    case "pending":
      return PaymentStatus.Pending;
    case "failed":
      return PaymentStatus.Failed;
    case "refunded":
    case "refund":
      return PaymentStatus.Refunded;
    case "partially_refunded":
    case "partial_refund":
      return PaymentStatus.PartiallyRefunded;
    case "canceled":
    case "cancelled":
      return PaymentStatus.Canceled;
    default:
      return PaymentStatus.Unknown;
  }
}

function isKnownStatus<T>(value: T | undefined, unknownValue: T): value is T {
  return value !== undefined && value !== unknownValue;
}

export function createProviderStatusMetadata(
  provider: PaymentProvider,
  raw: ProviderStatusFields,
): NormalizedEvent {
  const subscriptionStatus = mapProviderSubscriptionStatus(provider, raw.subscriptionStatus);
  const previousSubscriptionStatus = mapProviderSubscriptionStatus(provider, raw.previousSubscriptionStatus);
  const paymentStatus = mapProviderPaymentStatus(provider, raw.paymentStatus, raw.refundType);

  const includeSubscriptionStatus = isKnownStatus(subscriptionStatus, SubscriptionStatus.Unknown);
  const includePreviousSubscriptionStatus = isKnownStatus(previousSubscriptionStatus, SubscriptionStatus.Unknown);
  const includePaymentStatus = isKnownStatus(paymentStatus, PaymentStatus.Unknown);

  return {
    ...(includeSubscriptionStatus ? { subscriptionStatus } : {}),
    ...(includePreviousSubscriptionStatus ? { previousSubscriptionStatus } : {}),
    ...(includePaymentStatus ? { paymentStatus } : {}),
    provider: {
      name: provider,
      ...(includeSubscriptionStatus ? { subscriptionStatus } : {}),
      ...(includePreviousSubscriptionStatus ? { previousSubscriptionStatus } : {}),
      ...(includePaymentStatus ? { paymentStatus } : {}),
      raw,
    },
  };
}
