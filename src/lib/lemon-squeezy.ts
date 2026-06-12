import { VercelRequest } from '@vercel/node';
import { Request } from 'express';
import Askrift from './askrift';
import { getHeader, getRawBody, hmacSha256Hex, isPostJsonOrForm, parseBody, timingSafeEqualString } from './utils';
import {
  LemonSqueezyPaymentFailed,
  LemonSqueezyPaymentRefunded,
  LemonSqueezyPaymentSucceeded,
  LemonSqueezySubscriptionCancelled,
  LemonSqueezySubscriptionCreated,
  LemonSqueezySubscriptionUpdated,
  LemonSqueezyWebhookPayload,
} from '../types/lemon-squeezy/subscription';

const EVENT_MAP = {
  created: ['subscription_created'],
  updated: ['subscription_updated', 'subscription_resumed', 'subscription_unpaused'],
  canceled: ['subscription_expired'],
  paused: ['subscription_paused'],
  paymentSucceeded: ['subscription_payment_success'],
  paymentFailed: ['subscription_payment_failed'],
  paymentRefunded: ['order_refunded', 'refund_created', 'subscription_payment_refunded'],
};

function normalize(payload: LemonSqueezyWebhookPayload, type: any) {
  const attributes = payload.data?.attributes || {};
  return {
    provider: 'lemon-squeezy' as const,
    type,
    id: payload.data?.id,
    subscriptionId: attributes.subscription_id != null ? String(attributes.subscription_id) : (payload.data?.type === 'subscriptions' ? payload.data?.id || null : null),
    customerId: attributes.customer_id == null ? null : String(attributes.customer_id),
    customerEmail: (attributes as any).user_email || attributes.customer_email || null,
    productId: attributes.product_id == null ? null : String(attributes.product_id),
    amount: typeof attributes.total === 'number' ? attributes.total : null,
    currency: attributes.currency || null,
    occurredAt: attributes.created_at || attributes.updated_at || null,
    raw: payload,
  };
}

function promisify<T>(req: any, eventNames: string[], type: any): Promise<T | null> {
  return new Promise((resolve, reject) => {
    try {
      const payload = parseBody<LemonSqueezyWebhookPayload>(req);
      resolve(eventNames.includes(payload.meta?.event_name || '') ? normalize(payload, type) as unknown as T : null);
    } catch (error) {
      reject(error);
    }
  });
}

export default class LemonSqueezy extends Askrift<'lemon-squeezy'> {
  private _req;
  private _secret: string;

  constructor(req: VercelRequest | Request, debugged?: boolean) {
    super(debugged);
    if (!process.env.LEMON_SQUEEZY_WEBHOOK_SECRET) throw new Error('LEMON_SQUEEZY_WEBHOOK_SECRET is required');
    this._req = req;
    this._secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  }

  onSubscriptionCreated(): Promise<LemonSqueezySubscriptionCreated | null> {
    return promisify(this._req, EVENT_MAP.created, 'subscription.created');
  }
  onSubscriptionCanceled(): Promise<LemonSqueezySubscriptionCancelled | null> {
    return promisify(this._req, EVENT_MAP.canceled, 'subscription.canceled');
  }
  onSubscriptionPaused(): Promise<LemonSqueezySubscriptionCancelled | null> {
    return promisify(this._req, EVENT_MAP.paused, 'subscription.paused');
  }
  onSubscriptionUpdated(): Promise<LemonSqueezySubscriptionUpdated | null> {
    return promisify(this._req, EVENT_MAP.updated, 'subscription.updated');
  }
  onPaymentSucceeded(): Promise<LemonSqueezyPaymentSucceeded | null> {
    return promisify(this._req, EVENT_MAP.paymentSucceeded, 'payment.succeeded');
  }
  onPaymentFailed(): Promise<LemonSqueezyPaymentFailed | null> {
    return promisify(this._req, EVENT_MAP.paymentFailed, 'payment.failed');
  }
  onPaymentRefunded(): Promise<LemonSqueezyPaymentRefunded | null> {
    return promisify(this._req, EVENT_MAP.paymentRefunded, 'payment.refunded');
  }
  validRequest(): boolean {
    return isPostJsonOrForm(this._req);
  }
  validPayload(): boolean {
    const signature = getHeader(this._req.headers, 'x-signature');
    if (!signature) return false;
    const expected = hmacSha256Hex(this._secret, getRawBody(this._req));
    return timingSafeEqualString(signature, expected);
  }
}
