// Paddle Classic webhook payload types.
// Classic webhooks are form-encoded alerts identified by `alert_name` and
// verified with the `p_signature` RSA signature field.

export type PaddleClassicAlertName =
  | "payment_succeeded"
  | "payment_refunded"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_payment_succeeded"
  | "subscription_payment_failed"
  | "subscription_payment_refunded";

export interface PaddleClassicAlertBase {
  alert_id?: string;
  alert_name: PaddleClassicAlertName;
  event_time?: string;
  p_signature?: string;
  passthrough?: string;
  [key: string]: unknown;
}

export interface PaddleClassicPaymentBase extends PaddleClassicAlertBase {
  checkout_id?: string;
  country?: string;
  coupon?: string;
  currency?: string;
  customer_name?: string;
  email?: string;
  marketing_consent?: string | number;
  order_id?: string;
  payment_method?: PaddleClassicPaymentMethod;
  receipt_url?: string;
  sale_gross?: string;
}

export interface PaddleClassicRefundBase extends PaddleClassicPaymentBase {
  amount?: string;
  balance_currency?: string;
  balance_earnings_decrease?: string;
  balance_fee_refund?: string;
  balance_gross_refund?: string;
  balance_tax_refund?: string;
  earnings_decrease?: string;
  fee_refund?: string;
  gross_refund?: string;
  refund_reason?: string;
  refund_type?: PaddleClassicRefundType;
  tax_refund?: string;
}

export interface PaddleClassicPaymentSucceeded extends PaddleClassicPaymentBase {
  alert_name: "payment_succeeded";
  balance_currency?: string;
  balance_earnings?: string;
  balance_fee?: string;
  balance_gross?: string;
  balance_tax?: string;
  earnings?: string;
  fee?: string;
  payment_tax?: string;
  product_id?: string;
  product_name?: string;
  quantity?: string;
}

export interface PaddleClassicPaymentRefunded extends PaddleClassicRefundBase {
  alert_name: "payment_refunded";
  product_id?: string;
  product_name?: string;
  quantity?: string;
}

interface PaddleClassicSubscriptionBase extends PaddleClassicAlertBase {
  subscription_id?: string;
  subscription_plan_id?: string;
  checkout_id?: string;
  currency?: string;
  email?: string;
  marketing_consent?: string | number;
  status?: PaddleClassicSubscriptionStatus;
  user_id?: string;
}

interface PaddleClassicCancellable {
  cancel_url?: string;
}

interface PaddleClassicUpdatable {
  update_url?: string;
}

export interface PaddleClassicSubscriptionCreated extends PaddleClassicSubscriptionBase, PaddleClassicCancellable, PaddleClassicUpdatable {
  alert_name: "subscription_created";
  next_bill_date?: string;
  quantity?: string;
  source?: string;
  unit_price?: string;
}

export interface PaddleClassicSubscriptionUpdated extends PaddleClassicSubscriptionBase, PaddleClassicCancellable, PaddleClassicUpdatable {
  alert_name: "subscription_updated";
  new_price?: string;
  new_quantity?: string;
  new_unit_price?: string;
  next_bill_date?: string;
  old_next_bill_date?: string;
  old_price?: string;
  old_quantity?: string;
  old_status?: PaddleClassicSubscriptionStatus;
  old_subscription_plan_id?: string;
  old_unit_price?: string;
  paused_at?: string;
  paused_from?: string;
  paused_reason?: PaddleClassicPausedReason;
}

export interface PaddleClassicSubscriptionCancelled extends PaddleClassicSubscriptionBase {
  alert_name: "subscription_cancelled";
  cancellation_effective_date?: string;
  quantity?: string;
  unit_price?: string;
}

export interface PaddleClassicSubscriptionPaymentSucceeded extends PaddleClassicSubscriptionBase {
  alert_name: "subscription_payment_succeeded";
  balance_currency?: string;
  balance_earnings?: string;
  balance_fee?: string;
  balance_gross?: string;
  balance_tax?: string;
  country?: string;
  coupon?: string;
  customer_name?: string;
  earnings?: string;
  fee?: string;
  initial_payment?: string | number | boolean;
  instalments?: string;
  next_bill_date?: string;
  next_payment_amount?: string;
  order_id?: string;
  payment_method?: PaddleClassicPaymentMethod;
  payment_tax?: string;
  plan_name?: string;
  quantity?: string;
  receipt_url?: string;
  sale_gross?: string;
  subscription_payment_id?: string;
  unit_price?: string;
}

export interface PaddleClassicSubscriptionPaymentFailed extends PaddleClassicSubscriptionBase, PaddleClassicCancellable, PaddleClassicUpdatable {
  alert_name: "subscription_payment_failed";
  amount?: string;
  attempt_number?: string;
  instalments?: string;
  next_retry_date?: string;
  order_id?: string;
  quantity?: string;
  subscription_payment_id?: string;
  unit_price?: string;
}

export interface PaddleClassicSubscriptionPaymentRefunded extends PaddleClassicRefundBase, PaddleClassicSubscriptionBase {
  alert_name: "subscription_payment_refunded";
  initial_payment?: string | number | boolean;
  instalments?: string;
  quantity?: string;
  subscription_payment_id?: string;
  unit_price?: string;
}

export type PaddleClassicAlert =
  | PaddleClassicPaymentSucceeded
  | PaddleClassicPaymentRefunded
  | PaddleClassicSubscriptionCreated
  | PaddleClassicSubscriptionUpdated
  | PaddleClassicSubscriptionCancelled
  | PaddleClassicSubscriptionPaymentSucceeded
  | PaddleClassicSubscriptionPaymentFailed
  | PaddleClassicSubscriptionPaymentRefunded;

export enum PaddleClassicRefundType {
  Full = "full",
  Partial = "partial",
  Vat = "vat",
}

export enum PaddleClassicSubscriptionStatus {
  Active = "active",
  Deleted = "deleted",
  PastDue = "past_due",
  Paused = "paused",
  Trialing = "trialing",
}

export enum PaddleClassicPausedReason {
  Delinquent = "delinquent",
  Voluntary = "voluntary",
}

export enum PaddleClassicPaymentMethod {
  Card = "card",
  Paypal = "paypal",
}
