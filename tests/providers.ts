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

    const canceledReq = jsonReq({ ...saleBody, resource_name: 'subscription_ended' });
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
      ['subscription_expired', 'onSubscriptionCanceled', 'subscription.canceled'],
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
      ['subscription.revoked', 'onSubscriptionCanceled', 'subscription.canceled'],
      ['order.paid', 'onPaymentSucceeded', 'payment.succeeded'],
      ['subscription.past_due', 'onPaymentFailed', 'payment.failed'],
      ['order.refunded', 'onPaymentRefunded', 'payment.refunded'],
    ] as const) {
      const eventReq = jsonReq({ ...base, type: eventType }, { 'webhook-id': id, 'webhook-timestamp': timestamp });
      eventReq.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, eventReq.rawBody);
      assert.equal((await (initialize('polar', eventReq) as any)[handler]()).type, expectedType);
    }
  });

  it('rejects Gumroad payloads without a signature header', () => {
    const saleBody = {
      resource_name: 'sale',
      sale_id: 'sale_123',
    };
    const req = jsonReq(saleBody);
    const gumroad = initialize('gumroad', req);
    assert.equal(gumroad.validPayload(), false);
  });

  it('does not match Gumroad handlers when resource_name is absent', async () => {
    const req = jsonReq({ sale_id: 'sale_123' });
    req.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, req.rawBody);
    const gumroad = initialize('gumroad', req);
    assert.equal(await gumroad.onPaymentSucceeded(), null);
    assert.equal(await gumroad.onSubscriptionCreated(), null);
  });

  it('honors requireSubscription flag for Gumroad even when no resource matches', async () => {
    const req = jsonReq({ resource_name: 'sale', sale_id: 'sale_123' });
    req.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, req.rawBody);
    const gumroad = initialize('gumroad', req);
    assert.equal(await gumroad.onSubscriptionCreated(), null);
    assert.equal((await gumroad.onPaymentSucceeded())?.id, 'sale_123');
  });

  it('treats Lemon Squeezy subscription_paused as paused, not canceled', async () => {
    const base = {
      meta: { event_name: 'subscription_paused' },
      data: {
        id: 'sub_123',
        type: 'subscriptions',
        attributes: { user_email: 'buyer@example.com' },
      },
    };
    const req = jsonReq(base);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const lemon = initialize('lemon-squeezy', req) as any;
    assert.equal((await lemon.onSubscriptionCanceled()), null);
    assert.equal((await lemon.onSubscriptionPaused())?.type, 'subscription.paused');
  });

  it('reads Lemon Squeezy email from attributes.user_email', async () => {
    const base = {
      meta: { event_name: 'subscription_created' },
      data: {
        id: 'sub_123',
        type: 'subscriptions',
        attributes: {
          user_email: 'sub-user@example.com',
          customer_email: 'customer@example.com',
        },
      },
    };
    const req = jsonReq(base);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const lemon = initialize('lemon-squeezy', req);
    assert.equal((await lemon.onSubscriptionCreated())?.customerEmail, 'sub-user@example.com');
  });

  it('does not double-count Lemon Squeezy order_created as a subscription payment success', async () => {
    const base = {
      meta: { event_name: 'order_created' },
      data: {
        id: 'order_123',
        type: 'orders',
        attributes: { user_email: 'buyer@example.com' },
      },
    };
    const req = jsonReq(base);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const lemon = initialize('lemon-squeezy', req);
    assert.equal(await lemon.onPaymentSucceeded(), null);
  });

  it('treats Polar subscription.active as an update, not a new subscription', async () => {
    const id = 'msg_456';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const base = {
      type: 'subscription.active',
      data: { id: 'sub_456', customer_id: 'cus_456' },
    };
    const req = jsonReq(base, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    req.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, req.rawBody);
    const polar = initialize('polar', req);
    assert.equal(await polar.onSubscriptionCreated(), null);
    assert.equal((await polar.onSubscriptionUpdated())?.type, 'subscription.updated');
  });

  it('ignores Polar refund events while the refund is still pending', async () => {
    const id = 'msg_789';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const pending = {
      type: 'refund.created',
      data: { id: 'ref_1', status: 'pending' },
    };
    const pendingReq = jsonReq(pending, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    pendingReq.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, pendingReq.rawBody);
    assert.equal(await initialize('polar', pendingReq).onPaymentRefunded(), null);

    const succeeded = {
      type: 'refund.updated',
      data: { id: 'ref_2', status: 'succeeded' },
    };
    const okReq = jsonReq(succeeded, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    okReq.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, okReq.rawBody);
    assert.equal((await initialize('polar', okReq).onPaymentRefunded())?.type, 'payment.refunded');
  });

  it('prefers Polar modified_at for occurredAt when present', async () => {
    const id = 'msg_mod';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = {
      type: 'subscription.updated',
      data: {
        id: 'sub_mod',
        customer_id: 'cus_mod',
        created_at: '2026-01-01T00:00:00Z',
        modified_at: '2026-02-15T12:34:56Z',
      },
    };
    const req = jsonReq(body, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    req.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, req.rawBody);
    const event = await initialize('polar', req).onSubscriptionUpdated();
    assert.equal(event?.occurredAt, '2026-02-15T12:34:56Z');
  });

  it('prefers Lemon Squeezy updated_at for occurredAt when present', async () => {
    const body = {
      meta: { event_name: 'subscription_updated' },
      data: {
        id: 'sub_ls',
        type: 'subscriptions',
        attributes: {
          customer_email: 'buyer@example.com',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-03-20T08:00:00Z',
        },
      },
    };
    const req = jsonReq(body);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const event = await initialize('lemon-squeezy', req).onSubscriptionUpdated();
    assert.equal(event?.occurredAt, '2026-03-20T08:00:00Z');
  });

  it('does not map Gumroad dispute_won events to payment.refunded', async () => {
    const body = {
      resource_name: 'dispute_won',
      sale_id: 'sale_dw',
    };
    const req = jsonReq(body);
    req.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, req.rawBody);
    const gumroad = initialize('gumroad', req);
    assert.equal(await gumroad.onPaymentRefunded(), null);
  });

  it('does not map recurring Gumroad sales to subscription.created', async () => {
    const body = {
      resource_name: 'sale',
      sale_id: 'sale_recurring',
      subscription_id: 'sub_recurring',
      recurring: true,
    };
    const req = jsonReq(body);
    req.headers['x-gumroad-signature'] = hmacHex(process.env.GUMROAD_WEBHOOK_SECRET!, req.rawBody);
    const gumroad = initialize('gumroad', req);
    assert.equal(await gumroad.onSubscriptionCreated(), null);
    assert.equal((await gumroad.onPaymentSucceeded())?.id, 'sale_recurring');
  });

  it('treats Polar order.refunded with partially_refunded status as a refund', async () => {
    const id = 'msg_partial';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = {
      type: 'order.refunded',
      data: { id: 'ord_partial', status: 'partially_refunded', refunded_amount: 500 },
    };
    const req = jsonReq(body, { 'webhook-id': id, 'webhook-timestamp': timestamp });
    req.headers['webhook-signature'] = polarSignature(process.env.POLAR_WEBHOOK_SECRET!, id, timestamp, req.rawBody);
    const event = await initialize('polar', req).onPaymentRefunded();
    assert.equal(event?.type, 'payment.partially_refunded');
    assert.equal(event?.amount, 500);
  });

  it('reports Lemon Squeezy refund amount from refunded_amount when present', async () => {
    const body = {
      meta: { event_name: 'order_refunded' },
      data: {
        id: 'ord_ls',
        type: 'orders',
        attributes: {
          total: 2900,
          refunded_amount: 1200,
          currency: 'USD',
        },
      },
    };
    const req = jsonReq(body);
    req.headers['x-signature'] = hmacHex(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!, req.rawBody);
    const event = await initialize('lemon-squeezy', req).onPaymentRefunded();
    assert.equal(event?.amount, 1200);
  });
});
