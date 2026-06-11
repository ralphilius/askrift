import { VercelRequest } from '@vercel/node';
import { Request } from 'express';
import Askrift from './askrift';
import { getHeader, getRawBody, hmacSha256Hex, isPostJsonOrForm, parseBody, timingSafeEqualString } from './utils';
import {
  GumroadPaymentFailed,
  GumroadPaymentRefunded,
  GumroadPaymentSucceeded,
  GumroadSubscriptionCancelled,
  GumroadSubscriptionCreated,
  GumroadSubscriptionUpdated,
  GumroadWebhookPayload,
} from '../types/gumroad/subscription';

const EVENT_MAP = {
  created: ['sale'],
  updated: ['subscription_updated', 'subscription_restarted'],
  canceled: ['cancellation', 'subscription_ended'],
  paymentSucceeded: ['sale'],
  paymentFailed: ['dispute'],
  paymentRefunded: ['refund', 'dispute_won'],
};

function normalize(payload: GumroadWebhookPayload, type: any) {
  return {
    provider: 'gumroad' as const,
    type,
    id: payload.sale_id,
    subscriptionId: payload.subscription_id || null,
    customerId: payload.purchaser_id || null,
    customerEmail: payload.email || null,
    productId: payload.product_id || null,
    amount: payload.price == null ? null : Number(payload.price),
    currency: payload.currency || null,
    occurredAt: payload.sale_timestamp || null,
    raw: payload,
  };
}

function promisify<T>(req: any, eventNames: string[], type: any, requireSubscription = false): Promise<T | null> {
  return new Promise((resolve, reject) => {
    try {
      const payload = parseBody<GumroadWebhookPayload>(req);
      const resource = payload.resource_name || getHeader(req.headers, 'x-gumroad-resource-name');
      const matches = eventNames.includes(resource || '') && (!requireSubscription || Boolean(payload.subscription_id));
      resolve(matches ? normalize(payload, type) as unknown as T : null);
    } catch (error) {
      reject(error);
    }
  });
}

export default class Gumroad extends Askrift<'gumroad'> {
  private _req;
  private _secret: string;

  constructor(req: VercelRequest | Request, debugged?: boolean) {
    super(debugged);
    if (!process.env.GUMROAD_WEBHOOK_SECRET) throw 'GUMROAD_WEBHOOK_SECRET is required';
    this._req = req;
    this._secret = process.env.GUMROAD_WEBHOOK_SECRET;
  }

  onSubscriptionCreated(): Promise<GumroadSubscriptionCreated | null> {
    return promisify(this._req, EVENT_MAP.created, 'subscription.created', true);
  }
  onSubscriptionCanceled(): Promise<GumroadSubscriptionCancelled | null> {
    return promisify(this._req, EVENT_MAP.canceled, 'subscription.canceled');
  }
  onSubscriptionUpdated(): Promise<GumroadSubscriptionUpdated | null> {
    return promisify(this._req, EVENT_MAP.updated, 'subscription.updated');
  }
  onPaymentSucceeded(): Promise<GumroadPaymentSucceeded | null> {
    return promisify(this._req, EVENT_MAP.paymentSucceeded, 'payment.succeeded');
  }
  onPaymentFailed(): Promise<GumroadPaymentFailed | null> {
    return promisify(this._req, EVENT_MAP.paymentFailed, 'payment.failed');
  }
  onPaymentRefunded(): Promise<GumroadPaymentRefunded | null> {
    return promisify(this._req, EVENT_MAP.paymentRefunded, 'payment.refunded');
  }
  validRequest(): boolean {
    return isPostJsonOrForm(this._req);
  }
  validPayload(): boolean {
    const signature = getHeader(this._req.headers, 'x-gumroad-signature') || getHeader(this._req.headers, 'x-signature');
    const expected = hmacSha256Hex(this._secret, getRawBody(this._req));
    return timingSafeEqualString(signature, expected);
  }
}
