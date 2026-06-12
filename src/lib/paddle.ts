import * as crypto from "crypto";
import { serialize } from 'php-serialize';
import Askrift, { AskriftParsedEvent } from "./askrift";
import {
  SubscriptionCancelled,
  SubscriptionCreated,
  SubscriptionPaymentFailed,
  SubscriptionPaymentRefunded,
  SubscriptionPaymentSucceeded,
  SubscriptionUpdated,
} from "../types/paddle/subscription";
import {
  NormalizedSubscriptionEvent,
  SUBSCRIPTION_EVENT_TYPES,
  SubscriptionEventType,
} from "../types/events";
import { fromRaw } from "./request";
import type { InternalRequest } from "./request";
import { isObject } from "./utils";

type PaddlePayload = { [k: string]: any };

export type PaddleOptions = {
  /** Paddle public key, with or without PEM headers. Falls back to PADDLE_PUBLIC_KEY. */
  publicKey?: string;
  /** Enable debug logging. */
  debug?: boolean;
};

function normalizePublicKey(publicKey: string): string {
  if (!publicKey || !publicKey.trim()) {
    throw new Error("Public key cannot be empty");
  }
  const normalized = publicKey.replace(/\\n/g, '\n');
  if (normalized.includes('-----BEGIN PUBLIC KEY-----')) {
    return normalized;
  }

  return `-----BEGIN PUBLIC KEY-----\n${normalized}\n-----END PUBLIC KEY-----`;
}

export type PaddleSubscriptionEvents = {
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated]: SubscriptionCreated;
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated]: SubscriptionUpdated;
  [SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled]: SubscriptionCancelled;
  [SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded]: SubscriptionPaymentSucceeded;
  [SUBSCRIPTION_EVENT_TYPES.PaymentFailed]: SubscriptionPaymentFailed;
  [SUBSCRIPTION_EVENT_TYPES.PaymentRefunded]: SubscriptionPaymentRefunded;
};

const PADDLE_EVENT_TYPES: Record<string, SubscriptionEventType> = {
  subscription_created: SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated,
  subscription_updated: SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated,
  subscription_cancelled: SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled,
  subscription_payment_succeeded: SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded,
  subscription_payment_failed: SUBSCRIPTION_EVENT_TYPES.PaymentFailed,
  subscription_payment_refunded: SUBSCRIPTION_EVENT_TYPES.PaymentRefunded,
};

function ksort(obj: PaddlePayload) {
  const keys = Object.keys(obj).sort();
  let sortedObj: PaddlePayload = {};
  for (const key of keys) {
    sortedObj[key] = obj[key];
  }
  return sortedObj;
}

function toDate(value?: Date | string): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const normalized = typeof value === 'string' && value.includes(' ')
    ? value.replace(' ', 'T') + 'Z'
    : value;
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? undefined : date;
}

function normaliseContentType(contentType: string | string[] | undefined): string {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.split(';')[0].trim().toLowerCase() || '';
}

function normalizePaddleEventName(alertName: string): string {
  return alertName.replace(/_/g, '.');
}

function parseBody(body: any): PaddlePayload | null {
  if (isObject(body) && !Array.isArray(body)) return body;
  if (typeof body !== 'string') return null;

  try {
    const parsed = JSON.parse(body);
    return isObject(parsed) ? parsed : null;
  } catch (error) {
    if (!body.includes('=')) return null;
    const params = new URLSearchParams(body);
    const payload: PaddlePayload = {};
    params.forEach((value, key) => {
      payload[key] = value;
    });

    return Object.keys(payload).length > 0 ? payload : null;
  }
}

export function verifyPaddleSignature(payload: unknown, publicKey: string): boolean {
  if (!isObject(payload) || Array.isArray(payload)) return false;

  const copiedPayload = { ...(payload as { [k: string]: any }) };
  const signature = copiedPayload.p_signature;

  if (typeof signature !== 'string') return false;

  delete copiedPayload.p_signature;

  let jsonObj = ksort(copiedPayload);
  for (const property of Object.keys(jsonObj)) {
    if ((typeof jsonObj[property]) !== "string") {
      if (Array.isArray(jsonObj[property])) { // is it an array
        jsonObj[property] = jsonObj[property].toString();
      } else { //if its not an array and not a string, then it is a JSON obj
        jsonObj[property] = JSON.stringify(jsonObj[property]);
      }
    }
  }

  try {
    const mySig = Buffer.from(signature, 'base64');
    const serialized = serialize(jsonObj);
    const verifier = crypto.createVerify('sha1');
    verifier.update(serialized);
    verifier.end();

    return verifier.verify(publicKey, mySig);
  } catch (error) {
    return false;
  }
}

export default class Paddle extends Askrift<PaddleSubscriptionEvents> {
  private _req: InternalRequest;
  private _pubKey: string;
  private _parsedBody: PaddlePayload | null | undefined;
  private _parsedEventPromise: Promise<NormalizedSubscriptionEvent | null> | null = null;

  constructor(req: InternalRequest, options: PaddleOptions | boolean = {}) {
    const paddleOptions = typeof options === 'boolean' ? { debug: options } : options;
    super(paddleOptions.debug);

    const publicKey = paddleOptions.publicKey !== undefined ? paddleOptions.publicKey : process.env.PADDLE_PUBLIC_KEY;
    if (!publicKey) throw new Error("Paddle public key is required (provide via options.publicKey or PADDLE_PUBLIC_KEY environment variable)");

    this._req = fromRaw(req);
    this._pubKey = normalizePublicKey(publicKey);
  }

  onSubscriptionCreated(): Promise<SubscriptionCreated | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated);
  }

  onSubscriptionCanceled(): Promise<SubscriptionCancelled | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled);
  }

  onSubscriptionUpdated(): Promise<SubscriptionUpdated | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated);
  }

  onPaymentSucceeded(): Promise<SubscriptionPaymentSucceeded | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded);
  }

  onPaymentFailed(): Promise<SubscriptionPaymentFailed | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentFailed);
  }

  onPaymentRefunded(): Promise<SubscriptionPaymentRefunded | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentRefunded);
  }

  validRequest(): boolean {
    if (this._req.method !== 'POST') return false;
    const contentType = normaliseContentType(this._req.headers['content-type']);
    return contentType === 'application/x-www-form-urlencoded' || contentType === 'application/json';
  }

  verify(): boolean {
    this.debug(this._req.body);
    const body = parseBody(this._req.body);
    if (!body) {
      this._parsedBody = null;
      return false;
    }

    this.debug("PADDLE_PUBLIC_KEY", this._pubKey);
    const verified = verifyPaddleSignature(body, this._pubKey);
    this._parsedBody = verified ? body : null;
    return verified;
  }

  getEventType(): SubscriptionEventType | null {
    const body = this._parsedBody;
    if (!body || typeof body.alert_name !== 'string') return null;
    return PADDLE_EVENT_TYPES[body.alert_name] || null;
  }

  toNormalizedEvent(): NormalizedSubscriptionEvent | null {
    const body = this._parsedBody;
    if (!body) return null;

    const type = this.getEventType();
    if (!type) return null;

    const base = {
      type,
      provider: 'paddle',
      raw: body,
      eventId: body.alert_id,
      occurredAt: toDate(body.event_time),
      subscriptionId: body.subscription_id,
      subscriptionPlanId: body.subscription_plan_id,
      customerId: body.user_id,
      customerEmail: body.email,
      currency: body.currency,
      status: body.status,
    };

    switch (type) {
      case SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated:
        return {
          ...base,
          type,
          nextBillDate: toDate(body.next_bill_date),
        };
      case SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated:
        return {
          ...base,
          type,
          nextBillDate: toDate(body.next_bill_date),
          previousStatus: body.old_status,
          previousSubscriptionPlanId: body.old_subscription_plan_id,
        };
      case SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled:
        return {
          ...base,
          type,
          cancellationEffectiveDate: toDate(body.cancellation_effective_date),
        };
      case SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded:
        return {
          ...base,
          type,
          paymentId: body.subscription_payment_id,
          orderId: body.order_id,
          amount: body.sale_gross,
          nextBillDate: toDate(body.next_bill_date),
          receiptUrl: body.receipt_url,
        };
      case SUBSCRIPTION_EVENT_TYPES.PaymentFailed:
        return {
          ...base,
          type,
          paymentId: body.subscription_payment_id,
          orderId: body.order_id,
          amount: body.amount,
          nextRetryDate: toDate(body.next_retry_date),
          attemptNumber: body.attempt_number,
        };
      case SUBSCRIPTION_EVENT_TYPES.PaymentRefunded:
        return {
          ...base,
          type,
          paymentId: body.subscription_payment_id,
          orderId: body.order_id,
          amount: body.amount,
          refundType: body.refund_type,
          refundReason: body.refund_reason,
        };
      default:
        return null;
    }
  }

  async parseEvent(): Promise<NormalizedSubscriptionEvent | null> {
    if (this._parsedEventPromise) {
      return this._parsedEventPromise;
    }
    if (!parseBody(this._req.body)) {
      throw new Error("Could not parse webhook body");
    }
    const result = this.verify() ? this.toNormalizedEvent() : null;
    this._parsedEventPromise = Promise.resolve(result);
    return this._parsedEventPromise;
  }

  protected parseProviderEvent(): AskriftParsedEvent | null {
    if (!this._parsedBody) return null;

    const body = this._parsedBody;
    if (typeof body.alert_name !== 'string') return null;

    const providerEventType = body.alert_name;
    const eventType = normalizePaddleEventName(providerEventType);

    return {
      eventType,
      payload: body,
      provider: 'paddle',
      providerEventType,
      aliases: [`paddle.${providerEventType}`],
    };
  }
}
