import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import * as crypto from "crypto";
import { serialize } from 'php-serialize';
import Askrift from "./askrift";
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
import { isObject } from "./utils";

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

function ksort(obj: { [k: string]: any }) {
  const keys = Object.keys(obj).sort();
  let sortedObj: { [k: string]: any } = {};
  for (let i in keys) {
    sortedObj[keys[i]] = obj[keys[i]];
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

export default class Paddle extends Askrift<PaddleSubscriptionEvents> {
  private _req;
  private _pubKey: string;
  private _parsedBody: any;
  private _parsedEventPromise: Promise<NormalizedSubscriptionEvent | null> | null = null;

  constructor(req: VercelRequest | Request, debugged?: boolean) {
    super(debugged);
    if (!process.env.PADDLE_PUBLIC_KEY) throw new Error("PADDLE_PUBLIC_KEY is required");
    this._req = req;
    this._pubKey = `-----BEGIN PUBLIC KEY-----\n${process.env.PADDLE_PUBLIC_KEY?.replace(/\\n/g, '\n')}\n-----END PUBLIC KEY-----`;
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
    return this._req.method == 'POST' && this._req.headers['content-type'] == 'application/x-www-form-urlencoded';
  }

  verify(): boolean {
    const body = this.parseBody();
    this.debug(body);
    if (!isObject(body) || typeof body.p_signature !== 'string') return false;

    this.debug("PADDLE_PUBLIC_KEY", this._pubKey);
    let jsonObj = { ...body };
    const mySig = Buffer.from(jsonObj.p_signature, 'base64');
    delete jsonObj.p_signature;
    jsonObj = ksort(jsonObj);
    for (let property in jsonObj) {
      if (jsonObj.hasOwnProperty(property) && (typeof jsonObj[property]) !== "string") {
        if (Array.isArray(jsonObj[property])) {
          jsonObj[property] = jsonObj[property].toString();
        } else {
          jsonObj[property] = JSON.stringify(jsonObj[property]);
        }
      }
    }

    try {
      const serialized = serialize(jsonObj);
      const verifier = crypto.createVerify('sha1');
      verifier.update(serialized);
      verifier.end();

      return verifier.verify(this._pubKey, mySig);
    } catch (error) {
      this.debug(error);
      return false;
    }
  }

  getEventType(): SubscriptionEventType | null {
    const body = this.parseBody();
    if (!isObject(body) || typeof body.alert_name !== 'string') return null;
    return PADDLE_EVENT_TYPES[body.alert_name] || null;
  }

  toNormalizedEvent(): NormalizedSubscriptionEvent | null {
    const body = this.parseBody();
    if (!isObject(body)) return null;

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

  parseEvent(): Promise<NormalizedSubscriptionEvent | null> {
    if (this._parsedEventPromise) {
      return this._parsedEventPromise;
    }
    const result = this.verify() ? this.toNormalizedEvent() : null;
    this._parsedEventPromise = Promise.resolve(result);
    return this._parsedEventPromise;
  }

  private parseBody(): any {
    if (this._parsedBody !== undefined) {
      return this._parsedBody;
    }
    try {
      if (typeof this._req.body === 'string') {
        this._parsedBody = JSON.parse(this._req.body);
      } else {
        this._parsedBody = this._req.body;
      }
    } catch (error) {
      this.debug(error);
      this._parsedBody = null;
    }
    return this._parsedBody;
  }
}
