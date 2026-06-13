import * as crypto from "crypto";
import Askrift from "./askrift";
import { SUBSCRIPTION_EVENT_TYPES } from "../types/events";
import type { SubscriptionEventType } from "../types/events";
import { fromRaw } from "./request";
import type { InternalRequest } from "./request";
import { extractStableEventId, isEventFresh } from "./idempotency";
import type { EventTimestampValidationOptions, NormalizedWebhookEvent } from "./idempotency";
import type { NormalizedSubscriptionEvent } from "../types/events";
import type {
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

export type StripeOptions = {
  publicKey?: string;
  debug?: boolean;
};

const SUPPORTED_EVENTS: StripeSupportedEventType[] = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const NORMALIZED_TYPE_MAP: Record<StripeSupportedEventType, SubscriptionEventType> = {
  "customer.subscription.created": SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated,
  "customer.subscription.updated": SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated,
  "customer.subscription.deleted": SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled,
  "invoice.payment_succeeded": SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded,
  "invoice.payment_failed": SUBSCRIPTION_EVENT_TYPES.PaymentFailed,
};

function isStripeSupportedEventType(type: string | undefined): type is StripeSupportedEventType {
  return typeof type === "string" && (SUPPORTED_EVENTS as string[]).includes(type);
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

function getHeader(headers: Record<string, string | string[] | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  return firstHeaderValue(headers[name.toLowerCase()] as string | string[] | undefined);
}

function rawBodyFromInternal(req: InternalRequest): string | null {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") {
    try {
      return JSON.stringify(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

function objectId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

function subscriptionIdFromEvent(event: StripeSupportedEvent): string | null {
  const object = event.data.object;
  if (event.type.indexOf("customer.subscription.") === 0) {
    return (object as StripeSubscription).id || null;
  }
  return objectId((object as StripeInvoice).subscription as string | StripeSubscription | null | undefined);
}

function invoiceIdFromEvent(event: StripeSupportedEvent): string | null {
  return event.type.indexOf("invoice.") === 0 ? ((event.data.object as StripeInvoice).id || null) : null;
}

export default class Stripe extends Askrift<"stripe"> {
  private _req: InternalRequest;
  private _webhookSecret: string;
  private _parsedEvent: StripeEvent | null = null;
  private _verified: boolean | null = null;

  constructor(req: InternalRequest, options: StripeOptions | boolean = {}) {
    const stripeOptions = typeof options === "boolean" ? { debug: options } : options;
    super(stripeOptions.debug);
    this._req = fromRaw(req);
    this._webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (!this._webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required");
    }
  }

  onSubscriptionCreated(): Promise<(SubscriptionCreated & NormalizedWebhookEvent) | null> {
    return this.getProviderEventForType("customer.subscription.created");
  }

  onSubscriptionCanceled(): Promise<(SubscriptionCancelled & NormalizedWebhookEvent) | null> {
    return this.getProviderEventForType("customer.subscription.deleted");
  }

  onSubscriptionUpdated(): Promise<(SubscriptionUpdated & NormalizedWebhookEvent) | null> {
    return this.getProviderEventForType("customer.subscription.updated");
  }

  onPaymentSucceeded(): Promise<(PaymentSucceeded & NormalizedWebhookEvent) | null> {
    return this.getProviderEventForType("invoice.payment_succeeded");
  }

  onPaymentFailed(): Promise<(PaymentFailed & NormalizedWebhookEvent) | null> {
    return this.getProviderEventForType("invoice.payment_failed");
  }

  onPaymentRefunded(): Promise<null> {
    return Promise.resolve(null);
  }

  validRequest(): boolean {
    const contentType = getHeader(this._req.headers, "content-type") || "";
    return (this._req.method || "").toUpperCase() === "POST" && contentType.indexOf("application/json") >= 0;
  }

  verify(): boolean {
    if (this._verified !== null) return this._verified;
    this._verified = this.verifySignature();
    return this._verified;
  }

  getEventType(): SubscriptionEventType | null {
    if (!this.verify()) return null;
    const event = this.parseEvent();
    if (!isStripeSupportedEventType(event.type)) return null;
    return NORMALIZED_TYPE_MAP[event.type];
  }

  toNormalizedEvent(): NormalizedSubscriptionEvent | null {
    if (!this.verify()) return null;
    const event = this.parseEvent();
    if (!isStripeSupportedEventType(event.type)) return null;
    const supportedEvent = event as StripeSupportedEvent;
    const object = supportedEvent.data.object;
    const normalizedType = NORMALIZED_TYPE_MAP[supportedEvent.type];

    return {
      type: normalizedType,
      provider: "stripe",
      eventId: supportedEvent.id,
      eventType: supportedEvent.type,
      occurredAt: new Date(supportedEvent.created * 1000),
      customerId: objectId((object as StripeSubscription | StripeInvoice).customer),
      subscriptionId: subscriptionIdFromEvent(supportedEvent),
      invoiceId: invoiceIdFromEvent(supportedEvent),
      raw: supportedEvent,
    } as unknown as NormalizedSubscriptionEvent;
  }

  getIdempotencyKey(): string | null {
    if (!this.verify()) return null;
    const event = this.parseEvent();
    return extractStableEventId("stripe", event);
  }

  getEventTimestamp(): Date | null {
    if (!this.verify()) return null;
    const event = this.parseEvent();
    return new Date(event.created * 1000);
  }

  isFresh(options: EventTimestampValidationOptions): boolean | null {
    if (!this.verify()) return null;
    const event = this.parseEvent();
    return isEventFresh("stripe", event, options);
  }

  isSupportedEventType(type: string): boolean {
    return isStripeSupportedEventType(type);
  }

  verifySignature(toleranceInSeconds: number = 300): boolean {
    const headers = this._req.headers || {};
    const signatureHeader = getHeader(headers, "stripe-signature");
    const rawBody = rawBodyFromInternal(this._req);

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

  private parseEvent(): StripeEvent {
    if (this._parsedEvent) return this._parsedEvent;
    if (!this.verifySignature()) throw new Error("Invalid Stripe signature");

    const rawBody = rawBodyFromInternal(this._req);
    if (!rawBody) throw new Error("Invalid Stripe body");

    const parsed = JSON.parse(rawBody) as StripeEvent;
    if (!parsed || parsed.object !== "event" || typeof parsed.type !== "string") {
      throw new Error("Invalid Stripe event");
    }

    this._parsedEvent = parsed;
    return parsed;
  }

  private async getProviderEventForType<T extends StripeSupportedEvent>(type: StripeSupportedEventType): Promise<(T & NormalizedSubscriptionEvent & NormalizedWebhookEvent) | null> {
    try {
      const event = this.parseEvent();
      if (event.type !== type) return null;
      const eventWithType = event as T;
      const baseEvent = this.toNormalizedEvent();
      if (!baseEvent) return null;
      return { ...eventWithType, ...baseEvent } as unknown as T & NormalizedSubscriptionEvent & NormalizedWebhookEvent;
    } catch (error) {
      this.debug(error);
      return null;
    }
  }
}

type SubscriptionCreated = StripeCustomerSubscriptionCreatedEvent;
type SubscriptionUpdated = StripeCustomerSubscriptionUpdatedEvent;
type SubscriptionCancelled = StripeCustomerSubscriptionDeletedEvent;
type PaymentSucceeded = StripeInvoicePaymentSucceededEvent;
type PaymentFailed = StripeInvoicePaymentFailedEvent;
type NormalizedSubscriptionEvent = NormalizedStripeEvent;
