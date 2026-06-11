import * as crypto from "crypto";

export const stripeWebhookSecret = "whsec_test_secret";
export const invalidStripeSignature = "bad_signature";

export const stripeSubscriptionCreatedEvent = {
  id: "evt_subscription_created",
  object: "event",
  created: 1620000000,
  data: {
    object: {
      id: "sub_123",
      object: "subscription",
      customer: "cus_123",
      status: "active",
    },
  },
  livemode: false,
  type: "customer.subscription.created",
};

export const stripeUnsupportedEvent = {
  id: "evt_unsupported",
  object: "event",
  created: 1620000000,
  data: {
    object: {
      id: "pi_123",
      object: "payment_intent",
      customer: "cus_123",
    },
  },
  livemode: false,
  type: "payment_intent.succeeded",
};

export const stripeInvoicePaymentSucceededEvent = {
  id: "evt_invoice_paid",
  object: "event",
  created: 1620000100,
  data: {
    object: {
      id: "in_123",
      object: "invoice",
      customer: "cus_123",
      subscription: "sub_123",
      amount_paid: 2000,
      currency: "usd",
      status: "paid",
    },
  },
  livemode: false,
  type: "invoice.payment_succeeded",
};

export function buildStripeRequest(event: Record<string, any>, signature?: string): any {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const validSignature = crypto
    .createHmac("sha256", stripeWebhookSecret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature || validSignature}`,
    },
    body,
  };
}
