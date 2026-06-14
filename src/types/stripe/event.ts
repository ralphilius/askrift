export type StripeSupportedEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_succeeded"
  | "invoice.payment_failed";

export type StripeNormalizedEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "payment.succeeded"
  | "payment.failed";

export interface StripeEvent<T = any> {
  id: string;
  object: "event";
  api_version?: string;
  created: number;
  data: {
    object: T;
    previous_attributes?: Record<string, any>;
  };
  livemode: boolean;
  pending_webhooks?: number;
  request?: {
    id?: string | null;
    idempotency_key?: string | null;
  } | null;
  type: string;
}

export interface StripeSubscription {
  id: string;
  object: "subscription";
  customer: string | StripeCustomer;
  status?: string;
  current_period_end?: number;
  current_period_start?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  cancel_at?: number | null;
  ended_at?: number | null;
  items?: Record<string, any>;
  metadata?: Record<string, string>;
  [key: string]: any;
}

export interface StripeInvoice {
  id: string;
  object: "invoice";
  customer: string | StripeCustomer | null;
  subscription?: string | StripeSubscription | null;
  amount_due?: number;
  amount_paid?: number;
  amount_remaining?: number;
  currency?: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  status?: string;
  metadata?: Record<string, string>;
  [key: string]: any;
}

export interface StripeCustomer {
  id: string;
  object: "customer";
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
  [key: string]: any;
}

export type StripeCustomerSubscriptionCreatedEvent = StripeEvent<StripeSubscription> & {
  type: "customer.subscription.created";
};

export type StripeCustomerSubscriptionUpdatedEvent = StripeEvent<StripeSubscription> & {
  type: "customer.subscription.updated";
};

export type StripeCustomerSubscriptionDeletedEvent = StripeEvent<StripeSubscription> & {
  type: "customer.subscription.deleted";
};

export type StripeInvoicePaymentSucceededEvent = StripeEvent<StripeInvoice> & {
  type: "invoice.payment_succeeded";
};

export type StripeInvoicePaymentFailedEvent = StripeEvent<StripeInvoice> & {
  type: "invoice.payment_failed";
};

export type StripeSupportedEvent =
  | StripeCustomerSubscriptionCreatedEvent
  | StripeCustomerSubscriptionUpdatedEvent
  | StripeCustomerSubscriptionDeletedEvent
  | StripeInvoicePaymentSucceededEvent
  | StripeInvoicePaymentFailedEvent;
