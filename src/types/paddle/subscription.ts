// Backwards-compatible subscription type exports. Prefer importing from
// `src/types/paddle/classic` for Paddle Classic or `src/types/paddle/billing`
// for Paddle Billing in new code.
export {
  PaddleClassicSubscriptionCancelled as SubscriptionCancelled,
  PaddleClassicSubscriptionCreated as SubscriptionCreated,
  PaddleClassicSubscriptionPaymentFailed as SubscriptionPaymentFailed,
  PaddleClassicSubscriptionPaymentRefunded as SubscriptionPaymentRefunded,
  PaddleClassicSubscriptionPaymentSucceeded as SubscriptionPaymentSucceeded,
  PaddleClassicSubscriptionUpdated as SubscriptionUpdated,
  PaddleClassicPausedReason as PausedReason,
  PaddleClassicPaymentMethod as SubscriptionPaymentMethod,
  PaddleClassicRefundType as RefundType,
  PaddleClassicSubscriptionStatus as Status,
} from "./classic";
