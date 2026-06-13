import { assert } from "chai";
import { initialize, Stripe } from "../src";
import {
  buildStripeRequest,
  invalidStripeSignature,
  stripeInvoicePaymentSucceededEvent,
  stripeSubscriptionCreatedEvent,
  stripeUnsupportedEvent,
  stripeWebhookSecret,
} from "./fixtures/stripe";

describe("library works with stripe", function () {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("should pass a valid signature", () => {
    const askrift = initialize("stripe", buildStripeRequest(stripeSubscriptionCreatedEvent));

    assert.equal(askrift.validRequest(), true);
    assert.equal(askrift.validPayload(), true);
  });

  it("should reject an invalid signature", () => {
    const askrift = initialize("stripe", buildStripeRequest(stripeSubscriptionCreatedEvent, invalidStripeSignature));

    assert.equal(askrift.validRequest(), true);
    assert.equal(askrift.validPayload(), false);
  });

  it("should reject an unsupported event", () => {
    const askrift = initialize("stripe", buildStripeRequest(stripeUnsupportedEvent)) as Stripe;

    assert.equal(askrift.validPayload(), true);
    assert.equal(askrift.getEventType(), null);
  });

  it("should convert supported events to normalized events", async () => {
    const askrift = initialize("stripe", buildStripeRequest(stripeInvoicePaymentSucceededEvent)) as Stripe;
    const event = await askrift.onPaymentSucceeded();
    const normalizedEvent = askrift.toNormalizedEvent() as any;

    assert.equal((event as any)?.type, "payment.succeeded");
    assert.equal(normalizedEvent?.provider, "stripe");
    assert.equal(normalizedEvent?.type, "payment.succeeded");
    assert.equal(normalizedEvent?.eventId, "evt_invoice_paid");
    assert.equal(normalizedEvent?.customerId, "cus_123");
    assert.equal(normalizedEvent?.subscriptionId, "sub_123");
    assert.equal(normalizedEvent?.invoiceId, "in_123");
  });
});
