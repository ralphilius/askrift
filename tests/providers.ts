import Askrift, { initialize } from '../src';
import { assert } from 'chai';
import * as crypto from 'crypto';

function jsonReq(body: object, headers: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body);
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    rawBody,
    body: rawBody,
  } as any;
}

function hmacHex(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function polarSignature(secret: string, id: string, timestamp: string, payload: string) {
  return `v1,${crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64')}`;
}

describe('provider lifecycle fixtures', function () {
  before(() => {
    process.env.GUMROAD_WEBHOOK_SECRET = 'gumroad-secret';
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'lemon-secret';
    process.env.POLAR_WEBHOOK_SECRET = 'polar-secret';
  });

  it('maps and verifies Gumroad subscription/payment lifecycle events', async () => {
    const saleBody = {
      resource_name: 'sale',
      sale_id: 'sale_123',
      subscription_id: 'sub_123',
      purchaser_id: 'buyer_123',
      email: 'buyer@example.com',
      product_id: 'prod_123',
      price: '2900',
      currency: 'usd',
      sale_timestamp: '2026-01-01T00:00:00Z',
    };
    const saleReq = jsonReq(saleBody);
    saleReq.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, saleReq.rawBody);
    const gumroad: Askrift<'gumroad'> = initialize('gumroad', saleReq);

    assert.equal(gumroad.validRequest(), true);
    assert.equal(gumroad.validPayload(), true);
    assert.equal((await gumroad.onSubscriptionCreated())?.type, 'subscription.created');
    assert.equal((await gumroad.onPaymentSucceeded())?.subscriptionId, 'sub_123');

    const refundReq = jsonReq({ ...saleBody, resource_name: 'refund' });
    refundReq.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, refundReq.rawBody);
    assert.equal((await initialize('gumroad', refundReq).onPaymentRefunded())?.type, 'payment.refunded');

    const canceledReq = jsonReq({ ...saleBody, resource_name: 'cancellation' });
    canceledReq.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, canceledReq.rawBody);
    assert.equal((await initialize('gumroad', canceledReq).onSubscriptionCanceled())?.type, 'subscription.canceled');
  });

  it('maps and verifies Lemon Squeezy subscription/payment lifecycle events', async () => {
    const base = {
      meta: { event_name: 'subscription_created' },
      data: {
        id: 'sub_123',
        type: 'subscriptions',
        attributes: {
          customer_id: 123,
          customer_email: 'buyer@example.com',
          product_id: 456,
          total: 2900,
          currency: 'USD',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    };
    const req = jsonReq(base);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const lemon: Askrift<'lemon-squeezy'> = initialize('lemon-squeezy', req);

    assert.equal(lemon.validRequest(), true);
    assert.equal(lemon.validPayload(), true);
    assert.equal((await lemon.onSubscriptionCreated())?.customerEmail, 'buyer@example.com');

    for (const [eventName, handler, expectedType] of [
      ['subscription_updated', 'onSubscriptionUpdated', 'subscription.updated'],
      ['subscription_cancelled', 'onSubscriptionCanceled', 'subscription.canceled'],
      ['subscription_payment_success', 'onPaymentSucceeded', 'payment.succeeded'],
      ['subscription_payment_failed', 'onPaymentFailed', 'payment.failed'],
      ['order_refunded', 'onPaymentRefunded', 'payment.refunded'],
    ] as const) {
      const eventReq = jsonReq({ ...base, meta: { event_name: eventName } });
      eventReq.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, eventReq.rawBody);
      assert.equal((await (initialize('lemon-squeezy', eventReq) as any)[handler]()).type, expectedType);
    }
  });

  it('maps and verifies Polar subscription/payment lifecycle events', async () => {
    const id = 'msg_123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const base = {
      type: 'subscription.created',
      data: {
        id: 'sub_123',
        customer_id: 'cus_123',
        customer: { id: 'cus_123', email: 'buyer@example.com' },
        product_id: 'prod_123',
        amount: 2900,
        currency: 'usd',
        created_at: '2026-01-01T00:00:00Z',
      },
    };
    const req = jsonReq(base, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    req.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, req.rawBody);
    const polar: Askrift<'polar'> = initialize('polar', req);

    assert.equal(polar.validRequest(), true);
    assert.equal(polar.validPayload(), true);
    assert.equal((await polar.onSubscriptionCreated())?.subscriptionId, 'sub_123');

    for (const [eventType, handler, expectedType] of [
      ['subscription.updated', 'onSubscriptionUpdated', 'subscription.updated'],
      ['subscription.canceled', 'onSubscriptionCanceled', 'subscription.canceled'],
      ['order.paid', 'onPaymentSucceeded', 'payment.succeeded'],
      ['subscription.past_due', 'onPaymentFailed', 'payment.failed'],
      ['order.refunded', 'onPaymentRefunded', 'payment.refunded'],
    ] as const) {
      const eventReq = jsonReq({ ...base, type: eventType }, { 'webhook-id': id, 'webhook-timestamp': timestamp });
      eventReq.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, eventReq.rawBody);
      assert.equal((await (initialize('polar', eventReq) as any)[handler]()).type, expectedType);
    }
  });
});
