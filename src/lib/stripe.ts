import { VercelRequest } from "@vercel/node";
import { Request } from "express";
import * as crypto from "crypto";
import Askrift from "./askrift";
import {
  NormalizedStripeEvent,
  StripeCustomerSubscriptionCreatedEvent,
  StripeCustomerSubscriptionDeletedEvent,
  StripeCustomerSubscriptionUpdatedEvent,
  StripeEvent,
  StripeInvoice,
  StripeInvoicePaymentFailedEvent,
  StripeInvoicePaymentSucceededEvent,
  StripeSubscription,
  StripeSupportedEvent,
  StripeSupportedEventType,
} from "../types/stripe";

const SUPPORTED_EVENTS: StripeSupportedEventType[] = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const NORMALIZED_TYPES: Record<StripeSupportedEventType, NormalizedStripeEvent["type"]> = {
  "customer.subscription.created": "subscription.created",
  "customer.subscription.updated": "subscription.updated",
  "customer.subscription.deleted": "subscription.deleted",
  "invoice.payment_succeeded": "payment.succeeded",
  "invoice.payment_failed": "payment.failed",
};

type StripeRequest = VercelRequest | Request;

function isStripeSupportedEventType(type: string): type is StripeSupportedEventType {
  return SUPPORTED_EVENTS.indexOf(type as StripeSupportedEventType) >= 0;
}

function timingSafeEqual(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let expectedBuffer: Buffer;
  let actualBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
    actualBuffer = Buffer.from(actual, "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeader(req: StripeRequest, name: string): string | undefined {
  const headers = req.headers || {};
  return firstHeaderValue(headers[name.toLowerCase()] as string | string[] | undefined);
}

function rawBodyFromRequest(req: StripeRequest): string | null {
  const requestWithRawBody = req as StripeRequest & { rawBody?: Buffer | string };

  if (typeof requestWithRawBody.rawBody === "string") return requestWithRawBody.rawBody;
  if (Buffer.isBuffer(requestWithRawBody.rawBody)) return requestWithRawBody.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  return null;
}

function objectId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

function subscriptionIdFromEvent(event: StripeSupportedEvent): string | null {
  const object = event.data.object;
  if (event.type.indexOf("customer.subscription.") === 0) return (object as StripeSubscription).id || null;

  return objectId((object as StripeInvoice).subscription as string | StripeSubscription | null | undefined);
}

function invoiceIdFromEvent(event: StripeSupportedEvent): string | null {
  return event.type.indexOf("invoice.") === 0 ? ((event.data.object as StripeInvoice).id || null) : null;
}

export default class Stripe extends Askrift<"stripe"> {
  private _req: StripeRequest;
  private _webhookSecret: string;
  private _event: StripeEvent | null = null;

  constructor(req: StripeRequest, debugged?: boolean) {
    super(debugged);
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is required");
    this._req = req;
    this._webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  onSubscriptionCreated(): Promise<StripeCustomerSubscriptionCreatedEvent | null> {
    return this.eventForType<StripeCustomerSubscriptionCreatedEvent>("customer.subscription.created");
  }

  onSubscriptionCanceled(): Promise<StripeCustomerSubscriptionDeletedEvent | null> {
    return this.eventForType<StripeCustomerSubscriptionDeletedEvent>("customer.subscription.deleted");
  }

  onSubscriptionUpdated(): Promise<StripeCustomerSubscriptionUpdatedEvent | null> {
    return this.eventForType<StripeCustomerSubscriptionUpdatedEvent>("customer.subscription.updated");
  }

  onPaymentSucceeded(): Promise<StripeInvoicePaymentSucceededEvent | null> {
    return this.eventForType<StripeInvoicePaymentSucceededEvent>("invoice.payment_succeeded");
  }

  onPaymentFailed(): Promise<StripeInvoicePaymentFailedEvent | null> {
    return this.eventForType<StripeInvoicePaymentFailedEvent>("invoice.payment_failed");
  }

  onPaymentRefunded(): Promise<null> {
    return Promise.resolve(null);
  }

  validRequest(): boolean {
    const contentType = getHeader(this._req, "content-type") || "";
    return this._req.method === "POST" && contentType.indexOf("application/json") >= 0;
  }

  validPayload(): boolean {
    if (!this.verifySignature()) return false;
    try {
      const event = this.parseEvent();
      return isStripeSupportedEventType(event.type);
    } catch (error) {
      this.debug(error);
      return false;
    }
  }

  isSupportedEventType(type: string): boolean {
    return isStripeSupportedEventType(type);
  }

  verifySignature(toleranceInSeconds: number = 300): boolean {
    const signatureHeader = getHeader(this._req, "stripe-signature");
    const rawBody = rawBodyFromRequest(this._req);

    if (!signatureHeader || !rawBody) return false;

    const signatureParts = signatureHeader.split(",").reduce<Record<string, string[]>>((memo, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex < 0) return memo;

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      memo[key] = memo[key] || [];
      memo[key].push(value);
      return memo;
    }, {});

    const timestamp = signatureParts.t && signatureParts.t[0];
    const signatures = signatureParts.v1 || [];
    if (!timestamp || signatures.length === 0) return false;

    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber)) return false;

    if (toleranceInSeconds > 0) {
      const age = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
      if (age > toleranceInSeconds) return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", this._webhookSecret)
      .update(signedPayload, "utf8")
      .digest("hex");

    return signatures.some((signature) => timingSafeEqual(expectedSignature, signature));
  }

  parseEvent(): StripeEvent {
    if (this._event) return this._event;
    if (!this.verifySignature()) throw new Error("Invalid Stripe signature");

    const rawBody = rawBodyFromRequest(this._req);
    if (!rawBody) throw new Error("Invalid Stripe body");

    const parsed = JSON.parse(rawBody) as StripeEvent;
    if (!parsed || parsed.object !== "event" || typeof parsed.type !== "string") {
      throw new Error("Invalid Stripe event");
    }

    this._event = parsed;
    return parsed;
  }

  getNormalizedEvent(): NormalizedStripeEvent | null {
    const event = this.parseEvent();
    if (!isStripeSupportedEventType(event.type)) return null;

    const supportedEvent = event as StripeSupportedEvent;
    const object = supportedEvent.data.object;

    return {
      provider: "stripe",
      type: NORMALIZED_TYPES[supportedEvent.type],
      eventId: supportedEvent.id,
      eventType: supportedEvent.type,
      created: new Date(supportedEvent.created * 1000),
      customerId: objectId((object as StripeSubscription | StripeInvoice).customer),
      subscriptionId: subscriptionIdFromEvent(supportedEvent),
      invoiceId: invoiceIdFromEvent(supportedEvent),
      data: object,
      raw: supportedEvent,
    };
  }

  private async eventForType<T extends StripeSupportedEvent>(type: StripeSupportedEventType): Promise<T | null> {
    const rawBody = rawBodyFromRequest(this._req);
    if (!rawBody) throw new Error("Invalid Stripe body");
    const event = JSON.parse(rawBody) as StripeEvent;
    return event.type === type ? (event as T) : null;
  }
}
