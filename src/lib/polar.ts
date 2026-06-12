import { VercelRequest } from '@vercel/node';
import { Request } from 'express';
import Askrift from './askrift';
import { getHeader, getRawBody, hmacSha256Base64, isPostJsonOrForm, parseBody, timingSafeEqualString } from './utils';
import {
  PolarPaymentFailed,
  PolarPaymentRefunded,
  PolarPaymentSucceeded,
  PolarSubscriptionCancelled,
  PolarSubscriptionCreated,
  PolarSubscriptionUpdated,
  PolarWebhookPayload,
} from '../types/polar/subscription';

const POLAR_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const EVENT_MAP = {
  created: ['subscription.created'],
  updated: ['subscription.updated', 'subscription.uncanceled', 'subscription.active'],
  canceled: ['subscription.revoked'],
  paymentSucceeded: ['order.paid'],
  paymentFailed: ['subscription.past_due'],
  paymentRefunded: ['order.refunded', 'refund.created', 'refund.updated'],
};

const REFUND_COMPLETED_STATUSES = new Set(['succeeded', 'refunded', 'paid', 'partially_refunded']);

function normalize(payload: PolarWebhookPayload, type: any) {
  const data = payload.data || {};
  const status = (data as any)?.status;
  const resolvedType = typeof status === 'string' && status.toLowerCase() === 'partially_refunded'
    ? 'payment.partially_refunded'
    : type;
  return {
    provider: 'polar' as const,
    type: resolvedType,
    id: data.id,
    subscriptionId: data.subscription_id || (payload.type?.startsWith('subscription.') ? data.id : null) || null,
    customerId: data.customer_id || data.customer?.id || null,
    customerEmail: data.customer?.email || null,
    productId: data.product_id || null,
    amount: typeof data.amount === 'number'
      ? data.amount
      : typeof data.refunded_amount === 'number'
        ? data.refunded_amount
        : typeof data.total_amount === 'number'
          ? data.total_amount
          : null,
    currency: data.currency || null,
    occurredAt: data.modified_at || data.created_at || null,
    raw: payload,
  };
}

function isRefundCompleted(payload: PolarWebhookPayload): boolean {
  const status = (payload.data as any)?.status;
  if (typeof status !== 'string') return true;
  return REFUND_COMPLETED_STATUSES.has(status.toLowerCase());
}

function promisify<T>(req: any, eventNames: string[], type: any, requireRefundCompleted = false): Promise<T | null> {
  return new Promise((resolve, reject) => {
    try {
      const payload = parseBody<PolarWebhookPayload>(req);
      if (!eventNames.includes(payload.type || '')) {
        resolve(null);
        return;
      }
      if (requireRefundCompleted && !isRefundCompleted(payload)) {
        resolve(null);
        return;
      }
      resolve(normalize(payload, type) as unknown as T);
    } catch (error) {
      reject(error);
    }
  });
}

export default class Polar extends Askrift<'polar'> {
  private _req;
  private _secret: string;

  constructor(req: VercelRequest | Request, debugged?: boolean) {
    super(debugged);
    if (!process.env.POLAR_WEBHOOK_SECRET) throw new Error('POLAR_WEBHOOK_SECRET is required');
    this._req = req;
    this._secret = process.env.POLAR_WEBHOOK_SECRET;
  }

  onSubscriptionCreated(): Promise<PolarSubscriptionCreated | null> { return promisify(this._req, EVENT_MAP.created, 'subscription.created'); }
  onSubscriptionCanceled(): Promise<PolarSubscriptionCancelled | null> { return promisify(this._req, EVENT_MAP.canceled, 'subscription.canceled'); }
  onSubscriptionUpdated(): Promise<PolarSubscriptionUpdated | null> { return promisify(this._req, EVENT_MAP.updated, 'subscription.updated'); }
  onPaymentSucceeded(): Promise<PolarPaymentSucceeded | null> { return promisify(this._req, EVENT_MAP.paymentSucceeded, 'payment.succeeded'); }
  onPaymentFailed(): Promise<PolarPaymentFailed | null> { return promisify(this._req, EVENT_MAP.paymentFailed, 'payment.failed'); }
  onPaymentRefunded(): Promise<PolarPaymentRefunded | null> { return promisify(this._req, EVENT_MAP.paymentRefunded, 'payment.refunded', true); }
  validRequest(): boolean { return isPostJsonOrForm(this._req); }
  validPayload(): boolean {
    const id = getHeader(this._req.headers, 'webhook-id');
    const timestamp = getHeader(this._req.headers, 'webhook-timestamp');
    const signatureHeader = getHeader(this._req.headers, 'webhook-signature');
    if (!id || !timestamp || !signatureHeader) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > POLAR_TIMESTAMP_TOLERANCE_SECONDS) return false;
    const signed = `${id}.${timestamp}.${getRawBody(this._req)}`;
    const possibleSecrets: (string | Buffer)[] = [this._secret];
    if (this._secret.startsWith('whsec_')) {
      possibleSecrets.push(Buffer.from(this._secret.slice(6), 'base64'));
    }
    const signatures = signatureHeader.split(' ').map((signature) => signature.replace(/^v1,/, ''));
    return possibleSecrets.some((secret) => signatures.some((signature) => timingSafeEqualString(signature, hmacSha256Base64(secret, signed))));
  }
}
