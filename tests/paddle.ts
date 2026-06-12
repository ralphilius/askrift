import Askrift, { initialize, fromVercel, UnsupportedProviderError, extractStableEventId, Paddle } from '../src';
import { paddlePaymentSucceededPayload, paddlePaymentSucceededDuplicatePayload, paddleStalePaymentSucceededPayload } from './fixtures/paddle';
import * as crypto from 'crypto';
import { serialize } from 'php-serialize';
import { assert } from 'chai';
import { verifyPaddleSignature } from '../src/lib/paddle';
import {
  PaymentStatus,
  ProviderStatusMetadata,
  SubscriptionStatus,
  mapProviderPaymentStatus,
  mapProviderSubscriptionStatus,
} from '../src/types/events';
import { Status } from '../src/types/paddle/subscription';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const previousPublicKey = process.env.PADDLE_PUBLIC_KEY;

const PUBLIC_KEY_BODY = publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .replace('-----BEGIN PUBLIC KEY-----', '')
  .replace('-----END PUBLIC KEY-----', '')
  .replace(/\s+/g, '');

process.env.PADDLE_PUBLIC_KEY = PUBLIC_KEY_BODY;
const BILLING_WEBHOOK_SECRET = 'pdl_billing_test_secret';
process.env.PADDLE_BILLING_WEBHOOK_SECRET = BILLING_WEBHOOK_SECRET;

const baseReq: any = {
  query: {},
  headers: {
    'content-type': 'application/x-www-form-urlencoded'
  },
};

const paddlePublicKey = `-----BEGIN PUBLIC KEY-----\n${process.env.PADDLE_PUBLIC_KEY}\n-----END PUBLIC KEY-----`;

const payload = paddlePaymentSucceededPayload;

function ksort(obj: { [k: string]: any }) {
  const keys = Object.keys(obj).sort();
  let sortedObj: { [k: string]: any } = {};
  for (const key of keys) {
    sortedObj[key] = obj[key];
  }
  return sortedObj;
}

function signPayload(payload: { [k: string]: any }): string {
  let signingPayload = ksort({ ...payload });

  for (const property of Object.keys(signingPayload)) {
    if ((typeof signingPayload[property]) !== 'string') {
      if (Array.isArray(signingPayload[property])) {
        signingPayload[property] = signingPayload[property].toString();
      } else {
        signingPayload[property] = JSON.stringify(signingPayload[property]);
      }
    }
  }

  const signer = crypto.createSign('sha1');
  signer.update(serialize(signingPayload));
  signer.end();

  return signer.sign(privateKey, 'base64');
}

function signedPayload(fields: { [k: string]: any }) {
  const jsonObj = ksort({ ...fields });
  for (const property of Object.keys(jsonObj)) {
    if ((typeof jsonObj[property]) !== "string") {
      if (Array.isArray(jsonObj[property])) {
        jsonObj[property] = jsonObj[property].toString();
      } else {
        jsonObj[property] = JSON.stringify(jsonObj[property]);
      }
    }
  }

  const signer = crypto.createSign('sha1');
  signer.update(serialize(jsonObj));
  signer.end();

  return JSON.stringify({
    ...fields,
    p_signature: signer.sign(privateKey, 'base64'),
  });
}

const validPayloadWithoutSignature = { ...payload };

const validPayload = {
  ...validPayloadWithoutSignature,
  p_signature: signPayload(validPayloadWithoutSignature),
};

const invalidPayload = {
  ...validPayloadWithoutSignature,
  p_signature: 'badsign',
};

function createReq(method: string, body = signedPayload(payload)): any {
  return {
    ...baseReq,
    method,
    body,
  };
}

function reqFor(method: string, body: any, contentType: string = 'application/x-www-form-urlencoded'): any {
  return {
    ...baseReq,
    method,
    headers: {
      ...baseReq.headers,
      'content-type': contentType,
    },
    body,
  };
}

const urlEncodedReq = {
  ...baseReq,
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
  },
  body: new URLSearchParams(validPayload).toString(),
};

const duplicatePayload = {
  ...paddlePaymentSucceededDuplicatePayload,
  p_signature: JSON.parse(signedPayload(paddlePaymentSucceededDuplicatePayload)).p_signature,
};

const stalePayload = {
  ...paddleStalePaymentSucceededPayload,
  p_signature: JSON.parse(signedPayload(paddleStalePaymentSucceededPayload)).p_signature,
};

const duplicateReq: any = {
  ...baseReq,
  method: 'POST',
  body: JSON.stringify(duplicatePayload),
};

const staleReq: any = {
  ...baseReq,
  method: 'POST',
  body: JSON.stringify(stalePayload),
};

describe('library works with paddle', function () {
  let askriftPd: Paddle;
  let askriftBadPd: Paddle;
  let askriftUrlEncodedPd: Paddle;
  let askriftDuplicatePd: Paddle;
  let askriftStalePd: Paddle;

  it('should initalize successfully', (done) => {
    askriftPd = initialize('paddle', fromVercel(createReq('POST')));
    askriftBadPd = initialize('paddle', fromVercel(createReq('GET', JSON.stringify({ ...payload, p_signature: 'badsign' }))));
    askriftUrlEncodedPd = initialize('paddle', fromVercel(urlEncodedReq));
    askriftDuplicatePd = initialize('paddle', fromVercel(duplicateReq));
    askriftStalePd = initialize('paddle', fromVercel(staleReq));
    done();
  });

  it('should pass valid request', (done) => {
    assert.equal(askriftPd.validRequest(), true);
    done();
  });

  it('should pass valid payload', (done) => {
    assert.equal(askriftPd.validPayload(), true);
    done();
  });

  it('should validate url-encoded payloads with content-type parameters', (done) => {
    assert.equal(askriftUrlEncodedPd.validRequest(), true);
    assert.equal(askriftUrlEncodedPd.validPayload(), true);
    done();
  });

  it('should keep payloads reusable after validation', async () => {
    assert.equal(askriftPd.validPayload(), true);
    const event = await askriftPd.onPaymentSucceeded();
    assert.equal(event?.p_signature, validPayload.p_signature);
  });

  it('should extract duplicate event IDs into the same provider-neutral idempotency key', async () => {
    assert.equal(extractStableEventId('paddle', payload), '120661188');
    assert.equal(askriftPd.getIdempotencyKey(), 'paddle:120661188');
    assert.equal(askriftDuplicatePd.getIdempotencyKey(), 'paddle:120661188');

    const event = await askriftDuplicatePd.onPaymentSucceeded();
    assert.equal(event?.getIdempotencyKey(), 'paddle:120661188');
  });

  it('should expose event timestamps and reject stale payloads when max age is provided', async () => {
    assert.equal(askriftPd.getEventTimestamp()?.toISOString(), '2021-09-10T10:36:39.000Z');
    assert.equal(askriftPd.validPayload({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), true);
    assert.equal(askriftStalePd.validPayload({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), false);

    const event = await askriftPd.onPaymentSucceeded();
    assert.equal(event?.getEventTimestamp()?.toISOString(), '2021-09-10T10:36:39.000Z');
    assert.equal(event?.isFresh({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), true);
  });

  it('should throw when maxAgeMs is negative', () => {
    assert.throws(
      () => askriftPd.validPayload({ maxAgeMs: -1 }),
      Error,
      'maxAgeMs must be non-negative'
    );
  });

  it('should reject payloads with missing timestamps when max age is provided', () => {
    const noTimestampPayload = { ...validPayloadWithoutSignature };
    delete (noTimestampPayload as { event_time?: string }).event_time;
    const signed = signPayload(noTimestampPayload);
    const body = { ...noTimestampPayload, p_signature: signed };
    const paddle = initialize('paddle', reqFor('POST', body, 'application/json'));

    assert.equal(paddle.validPayload(), true);
    assert.equal(paddle.validPayload({ maxAgeMs: 60 * 1000 }), false);
  });

  it('should clear parsed body when stale payload is rejected', () => {
    const paddle = initialize('paddle', staleReq);
    assert.equal(paddle.validPayload({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), false);
    assert.isNull(paddle.getEventType());
  });

  it('should expose helpers on parseEvent() results', async () => {
    const event = await askriftPd.parseEvent();
    assert.isNotNull(event);
    assert.equal(event?.getIdempotencyKey(), 'paddle:120661188');
    assert.equal(event?.getEventTimestamp()?.toISOString(), '2021-09-10T10:36:39.000Z');
    assert.equal(event?.isFresh({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), true);
  });

  it('should expose helpers when using validPayload() then toNormalizedEvent() directly', () => {
    const paddle = initialize('paddle', createReq('POST'));
    assert.equal(paddle.validPayload(), true);

    const event = paddle.toNormalizedEvent();
    assert.isNotNull(event);
    assert.equal(typeof event?.getIdempotencyKey, 'function');
    assert.equal(event?.getIdempotencyKey(), 'paddle:120661188');
    assert.equal(typeof event?.getEventTimestamp, 'function');
    assert.equal(event?.getEventTimestamp()?.toISOString(), '2021-09-10T10:36:39.000Z');
    assert.equal(typeof event?.isFresh, 'function');
    assert.equal(event?.isFresh({ maxAgeMs: 60 * 1000, now: new Date('2021-09-10T10:37:00Z') }), true);
  });

  it('should expose helpers on handle() payloads', async () => {
    const paddle = initialize('paddle', createReq('POST'));
    let received: any = null;
    paddle.on('subscription.payment.succeeded', (payload) => {
      received = payload;
    });

    const result = await paddle.handle();
    assert.equal(result.handled, true);
    assert.isNotNull(received);
    assert.equal(typeof received.getIdempotencyKey, 'function');
    assert.equal(received.getIdempotencyKey(), 'paddle:120661188');
    assert.equal(typeof received.getEventTimestamp, 'function');
    assert.equal(received.getEventTimestamp()?.toISOString(), '2021-09-10T10:36:39.000Z');
  });

  it('should trim whitespace-padded event IDs', () => {
    const padded = { ...paddlePaymentSucceededPayload, alert_id: '  120661188  ' };
    assert.equal(extractStableEventId('paddle', padded), '120661188');
  });

  it('should not pass invalid request', (done) => {
    assert.equal(askriftBadPd.validRequest(), false);
    done();
  });

  it('should not pass invalid payload', (done) => {
    assert.equal(askriftBadPd.validPayload(), false);
    done();
  });

  it('should return consistent results when validPayload is called multiple times', () => {
    const req = reqFor('POST', { ...validPayload }, 'application/json');
    const paddle = initialize('paddle', fromVercel(req));

    assert.equal(paddle.validPayload(), true);
    assert.equal(paddle.validPayload(), true);
  });

  it('should not remove p_signature from object request bodies after verification', () => {
    const body = { ...validPayload };
    const originalBody = JSON.parse(JSON.stringify(body));
    const paddle = initialize('paddle', fromVercel(reqFor('POST', body, 'application/json')));

    assert.equal(paddle.validPayload(), true);
    assert.deepEqual(body, originalBody);
  });

  it('should not replace string request bodies after verification', () => {
    const body = JSON.stringify(validPayload);
    const req = reqFor('POST', body, 'application/json');
    const paddle = initialize('paddle', fromVercel(req));

    assert.equal(paddle.validPayload(), true);
    assert.equal(req.body, body);
  });

  it('should verify signatures with the standalone helper without mutating payloads', () => {
    const body = { ...validPayload };
    const originalBody = JSON.parse(JSON.stringify(body));

    assert.equal(verifyPaddleSignature(body, paddlePublicKey), true);
    assert.deepEqual(body, originalBody);
  });

  it('should reject payloads missing p_signature', () => {
    assert.equal(verifyPaddleSignature({ ...validPayloadWithoutSignature }, paddlePublicKey), false);
    assert.equal(initialize('paddle', fromVercel(reqFor('POST', { ...validPayloadWithoutSignature }, 'application/json'))).validPayload(), false);
  });

  it('should reject malformed signatures', () => {
    const body = {
      ...validPayloadWithoutSignature,
      p_signature: 'not a valid paddle signature',
    };

    assert.equal(verifyPaddleSignature(body, paddlePublicKey), false);
    assert.equal(initialize('paddle', fromVercel(reqFor('POST', body, 'application/json'))).validPayload(), false);
  });

  it('should reject non-object payloads', () => {
    assert.equal(verifyPaddleSignature(null, paddlePublicKey), false);
    assert.equal(verifyPaddleSignature('not an object', paddlePublicKey), false);
    assert.equal(initialize('paddle', fromVercel(reqFor('POST', JSON.stringify(null), 'application/json'))).validPayload(), false);
    assert.equal(initialize('paddle', fromVercel(reqFor('POST', JSON.stringify('not an object'), 'application/json'))).validPayload(), false);
  });

  it('should hand parsed body from validPayload to onSubscriptionCreated for string bodies', async () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
    };
    const signedCreated = signPayload(createdPayload);
    const stringBody = JSON.stringify({ ...createdPayload, p_signature: signedCreated });
    const paddle = initialize('paddle', fromVercel(reqFor('POST', stringBody, 'application/json')));

    assert.equal(paddle.validPayload(), true);
    const event = await paddle.onSubscriptionCreated();
    assert.isNotNull(event);
    assert.equal(event?.alert_name, 'subscription_created');
    assert.equal(event?.p_signature, signedCreated);
  });

  it('should accept requests whose content-type includes a charset parameter', () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', formBody, 'application/x-www-form-urlencoded; charset=utf-8')));

    assert.equal(paddle.validRequest(), true);
  });

  it('should accept requests whose content-type is uppercase', () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', formBody, 'Application/X-WWW-Form-URLEncoded')));

    assert.equal(paddle.validRequest(), true);
  });

  it('should accept requests whose content-type is an array', () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const req = reqFor('POST', formBody, 'application/x-www-form-urlencoded');
    req.headers['content-type'] = ['application/x-www-form-urlencoded', 'text/plain'];
    const paddle = initialize('paddle', fromVercel(req));

    assert.equal(paddle.validRequest(), true);
  });

  it('should reject requests whose content-type is not form-urlencoded or json', () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', formBody, 'text/plain')));

    assert.equal(paddle.validRequest(), false);
  });

  it('should verify signatures of form-urlencoded Paddle Classic webhooks', () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', formBody, 'application/x-www-form-urlencoded')));

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), true);
  });

  it('should reject form-urlencoded bodies whose signature is invalid', () => {
    const invalidFormBody = new URLSearchParams(invalidPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', invalidFormBody, 'application/x-www-form-urlencoded')));

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), false);
  });

  it('should make event handlers work after validRequest() without calling validPayload() first', async () => {
    const formBody = new URLSearchParams(validPayload as any).toString();
    const paddle = initialize('paddle', fromVercel(reqFor('POST', formBody, 'application/x-www-form-urlencoded')));

    assert.equal(paddle.validRequest(), true);
    const event = await paddle.onPaymentSucceeded();
    assert.isNotNull(event);
    assert.equal(event?.alert_name, 'subscription_payment_succeeded');
    assert.equal(event?.subscription_id, '8');
  });
});

describe('provider registry initialization', function () {
  it('dispatches paddle through the provider registry', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));

    assert.equal(askriftPd.validRequest(), true);
    assert.equal(askriftPd.validPayload(), true);
    assert.deepInclude(await askriftPd.onPaymentSucceeded(), {
      alert_name: 'subscription_payment_succeeded',
      subscription_id: '8',
    });
    assert.equal(await askriftPd.onSubscriptionCreated(), null);
  });

  it('supports the existing boolean debug argument for paddle users', () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')), true);

    assert.equal(askriftPd.validRequest(), true);
  });

  it('supports the options object debug argument for paddle users', () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')), { debug: true });

    assert.equal(askriftPd.validRequest(), true);
  });

  it('throws UnsupportedProviderError for unsupported providers', () => {
    assert.throws(
      () => initialize('stripe' as any, fromVercel(createReq('POST'))),
      UnsupportedProviderError,
      'Unsupported provider: stripe'
    );
  });

  it('throws UnsupportedProviderError for unsupported object prototype keys', () => {
    assert.throws(
      () => initialize('__proto__' as any, fromVercel(createReq('POST'))),
      UnsupportedProviderError,
      'Unsupported provider: __proto__'
    );
  });
});

describe('handle() propagates handler failures', function () {
  it('reports a thrown handler error and returns handled: false', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));
    const boom = new Error('handler exploded');

    askriftPd.on('subscription.payment.succeeded', () => {
      throw boom;
    });

    const result = await askriftPd.handle();

    assert.equal(result.verified, true);
    assert.equal(result.handled, false);
    assert.equal(result.eventType, 'subscription.payment.succeeded');
    assert.isArray(result.errors);
    assert.lengthOf(result.errors!, 1);
    assert.strictEqual(result.errors![0], boom);
  });

  it('reports an async rejection and returns handled: false', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));

    askriftPd.on('subscription.payment.succeeded', async () => {
      throw new Error('async boom');
    });

    const result = await askriftPd.handle();

    assert.equal(result.handled, false);
    assert.isArray(result.errors);
    assert.lengthOf(result.errors!, 1);
    assert.instanceOf(result.errors![0], Error);
    assert.equal(result.errors![0].message, 'async boom');
  });

  it('returns handled: true and no errors when all handlers succeed', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));
    let called = 0;

    askriftPd.on('subscription.payment.succeeded', () => {
      called += 1;
    });

    const result = await askriftPd.handle();

    assert.equal(called, 1);
    assert.equal(result.handled, true);
    assert.isUndefined(result.errors);
  });
});

describe('paddle initialization options', function () {
  const previousPublicKey = process.env.PADDLE_PUBLIC_KEY;

  after(() => {
    if (previousPublicKey === undefined) {
      delete process.env.PADDLE_PUBLIC_KEY;
    } else {
      process.env.PADDLE_PUBLIC_KEY = previousPublicKey;
    }
  });

  it('should initalize successfully with explicit config', (done) => {
    delete process.env.PADDLE_PUBLIC_KEY;
    const askriftPd = initialize('paddle', createReq('POST'), { publicKey: PUBLIC_KEY_BODY });
    const askriftBadPd = initialize('paddle', createReq('GET', JSON.stringify({ ...payload, p_signature: 'badsign' })), { publicKey: PUBLIC_KEY_BODY });
    assert.equal(askriftPd.validRequest(), true);
    assert.equal(askriftPd.validPayload(), true);
    assert.equal(askriftBadPd.validPayload(), false);
    done();
  });

  it('should initalize successfully from PADDLE_PUBLIC_KEY env fallback', (done) => {
    process.env.PADDLE_PUBLIC_KEY = PUBLIC_KEY_BODY;
    const askriftFromEnv = initialize('paddle', createReq('POST'));
    assert.equal(askriftFromEnv.validPayload(), true);
    done();
  });
});

describe('request adapter falls back to rawBody', function () {
  it('should use rawBody when body is undefined (string rawBody)', () => {
    const rawBody = new URLSearchParams(validPayload).toString();
    const paddle = initialize('paddle', fromVercel({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody,
    }));
    assert.equal(paddle.validPayload(), true);
  });

  it('should use rawBody when body is undefined (Buffer rawBody)', () => {
    const rawBody = Buffer.from(JSON.stringify(validPayload));
    const paddle = initialize('paddle', fromVercel({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody,
    }));
    assert.equal(paddle.validPayload(), true);
  });

  it('should prefer body over rawBody when body is defined', () => {
    const paddle = initialize('paddle', fromVercel({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { ...validPayload },
      rawBody: 'unused-raw-body',
    }));
    assert.equal(paddle.validPayload(), true);
  });
});

describe('Paddle Billing webhook support', function () {
  const billingPayload = {
    event_id: 'evt_test_1',
    event_type: 'subscription.created',
    occurred_at: '2026-01-01T00:00:00Z',
    notification_id: 'ntf_test_1',
    data: {
      id: 'sub_test',
      status: 'active',
      customer_id: 'ctm_test',
      currency_code: 'USD',
    },
  };

  function signBilling(rawBody: string, ts: number = Math.floor(Date.now() / 1000)): string {
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    return `ts=${ts};h1=${h1}`;
  }

  function billingReq(method: string, body: string, signature?: string): any {
    return {
      query: {},
      method,
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'paddle-signature': signature } : {}),
      },
      body,
    };
  }

  it('verifies a valid Billing HMAC signature', () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody)));

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), true);
  });

  it('rejects Billing webhooks with an invalid HMAC signature', () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, 'ts=1;h1=deadbeef'));

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), false);
  });

  it('rejects Billing webhooks with a missing paddle-signature header', () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody));

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), false);
  });

  it('rejects Billing webhooks with an out-of-window timestamp (replay attack)', () => {
    const rawBody = JSON.stringify(billingPayload);
    const stale = Math.floor(Date.now() / 1000) - (60 * 60);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody, stale)));

    assert.equal(paddle.validPayload(), false);
  });

  it('exposes the parsed Billing event via onBillingEvent()', async () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody)));

    assert.equal(paddle.validPayload(), true);
    const event = await paddle.onBillingEvent();
    assert.isNotNull(event);
    assert.equal(event?.event_type, 'subscription.created');
    assert.equal(event?.data.id, 'sub_test');
  });

  it('filters Billing events through onBillingSubscriptionEvent()', async () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody)));

    const subscriptionEvent = await paddle.onBillingSubscriptionEvent();
    assert.isNotNull(subscriptionEvent);
    assert.equal((subscriptionEvent as any).event_type, 'subscription.created');

    assert.isNull(await paddle.onBillingTransactionEvent());
  });

  it('filters Billing events through onBillingTransactionEvent()', async () => {
    const transactionPayload = {
      ...billingPayload,
      event_id: 'evt_txn_1',
      event_type: 'transaction.completed',
      data: { id: 'txn_test', status: 'paid', customer_id: 'ctm_test', currency_code: 'USD' },
    };
    const rawBody = JSON.stringify(transactionPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody)));

    const transactionEvent = await paddle.onBillingTransactionEvent();
    assert.isNotNull(transactionEvent);
    assert.equal((transactionEvent as any).event_type, 'transaction.completed');

    assert.isNull(await paddle.onBillingSubscriptionEvent());
  });

  it('does not return Billing events from onClassicEvent()', async () => {
    const rawBody = JSON.stringify(billingPayload);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody)));

    assert.equal(paddle.validPayload(), true);
    assert.isNull(await paddle.onClassicEvent());
    assert.isNull(await paddle.onClassicSubscriptionEvent());
  });

  it('rejects Billing webhooks whose body cannot be located as a string or buffer', () => {
    const paddle = initialize('paddle-billing', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': 'ts=1;h1=deadbeef',
      },
      body: { event_type: 'subscription.created' },
    } as any);

    assert.equal(paddle.validPayload(), false);
  });
});

describe('paddle-billing allows initialization without PADDLE_PUBLIC_KEY', function () {
  const previousPublicKey = process.env.PADDLE_PUBLIC_KEY;
  const billingPayload = {
    event_id: 'evt_billing_only',
    event_type: 'subscription.created',
    occurred_at: '2026-01-01T00:00:00Z',
    notification_id: 'ntf_billing_only',
    data: { id: 'sub_billing_only', status: 'active', customer_id: 'ctm_billing_only', currency_code: 'USD' },
  };

  after(() => {
    if (previousPublicKey === undefined) {
      delete process.env.PADDLE_PUBLIC_KEY;
    } else {
      process.env.PADDLE_PUBLIC_KEY = previousPublicKey;
    }
  });

  it('initializes paddle-billing without PADDLE_PUBLIC_KEY', () => {
    delete process.env.PADDLE_PUBLIC_KEY;
    const rawBody = JSON.stringify(billingPayload);
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    const paddle = initialize('paddle-billing', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${ts};h1=${h1}`,
      },
      body: rawBody,
    } as any);

    assert.equal(paddle.validRequest(), true);
    assert.equal(paddle.validPayload(), true);
  });

  it('initializes paddle-billing with explicit options and no public key', () => {
    delete process.env.PADDLE_PUBLIC_KEY;
    const rawBody = JSON.stringify(billingPayload);
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    const paddle = initialize('paddle-billing', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${ts};h1=${h1}`,
      },
      body: rawBody,
    } as any, { debug: false });

    assert.equal(paddle.validPayload(), true);
  });
});

describe('provider kind enforcement', function () {
  it('rejects a Classic signed payload when initialized as paddle-billing', () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_created' }),
    };
    const paddle = initialize('paddle-billing', {
      query: {},
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createdPayload),
    } as any);

    assert.equal(paddle.validPayload(), false);
  });

  it('rejects a Billing signed payload when initialized as paddle-classic', () => {
    const billingPayload = {
      event_id: 'evt_kind_test',
      event_type: 'subscription.created',
      occurred_at: '2026-01-01T00:00:00Z',
      data: { id: 'sub_kind_test', status: 'active' },
    };
    const rawBody = JSON.stringify(billingPayload);
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    const paddle = initialize('paddle-classic', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${ts};h1=${h1}`,
      },
      body: rawBody,
    } as any);

    assert.equal(paddle.validPayload(), false);
  });

  it('still accepts a Billing signed payload when initialized as the legacy paddle entry', () => {
    const billingPayload = {
      event_id: 'evt_legacy_billing',
      event_type: 'subscription.created',
      occurred_at: '2026-01-01T00:00:00Z',
      data: { id: 'sub_legacy_billing', status: 'active' },
    };
    const rawBody = JSON.stringify(billingPayload);
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    const paddle = initialize('paddle', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${ts};h1=${h1}`,
      },
      body: rawBody,
    } as any);

    assert.equal(paddle.validPayload(), true);
  });
});

describe('Billing signature tolerance matches the documented 5-second window', function () {
  function billingReq(method: string, body: string, signature?: string): any {
    return {
      query: {},
      method,
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'paddle-signature': signature } : {}),
      },
      body,
    };
  }

  function signBilling(rawBody: string, ts: number): string {
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    return `ts=${ts};h1=${h1}`;
  }

  const billingPayload = {
    event_id: 'evt_window',
    event_type: 'subscription.created',
    occurred_at: '2026-01-01T00:00:00Z',
    data: { id: 'sub_window', status: 'active' },
  };
  const rawBody = JSON.stringify(billingPayload);

  it('accepts a Billing webhook with a current timestamp', () => {
    const ts = Math.floor(Date.now() / 1000);
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody, ts)));

    assert.equal(paddle.validPayload(), true);
  });

  it('accepts a Billing webhook with a 4-second-old timestamp', () => {
    const ts = Math.floor(Date.now() / 1000) - 4;
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody, ts)));

    assert.equal(paddle.validPayload(), true);
  });

  it('rejects a Billing webhook with a 6-second-old timestamp', () => {
    const ts = Math.floor(Date.now() / 1000) - 6;
    const paddle = initialize('paddle-billing', billingReq('POST', rawBody, signBilling(rawBody, ts)));

    assert.equal(paddle.validPayload(), false);
  });
});

describe('getRawBody recovers object bodies via JSON.stringify', function () {
  function signBilling(rawBody: string, ts: number): string {
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    return `ts=${ts};h1=${h1}`;
  }

  it('verifies a Billing webhook whose body is a parsed object instead of a string', () => {
    const billingPayload = {
      event_id: 'evt_object_body',
      event_type: 'subscription.created',
      occurred_at: '2026-01-01T00:00:00Z',
      data: { id: 'sub_object_body', status: 'active' },
    };
    const rawBody = JSON.stringify(billingPayload);
    const ts = Math.floor(Date.now() / 1000);
    const paddle = initialize('paddle-billing', {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': signBilling(rawBody, ts),
      },
      body: billingPayload,
    } as any);

    assert.equal(paddle.validPayload(), true);
  });
});

describe('Classic event aliases preserve paddle.* handler names', function () {
  it('dispatches handlers registered with the legacy paddle.<alert> alias', async () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_created' }),
    };
    const paddle = initialize('paddle', fromVercel(reqFor('POST', JSON.stringify(createdPayload), 'application/json')));
    let legacyCalls = 0;
    let prefixedCalls = 0;

    paddle.on('paddle.subscription_created', () => {
      legacyCalls += 1;
    });
    paddle.on('paddle-classic.subscription_created', () => {
      prefixedCalls += 1;
    });

    const result = await paddle.handle();
    assert.equal(result.verified, true);
    assert.equal(result.handled, true);
    assert.equal(legacyCalls, 1);
    assert.equal(prefixedCalls, 1);
  });

  it('still dispatches via the paddle.subscription_payment_succeeded README example', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));
    let paymentHandlerCalled = 0;

    askriftPd.on('paddle.subscription_payment_succeeded', () => {
      paymentHandlerCalled += 1;
    });

    const result = await askriftPd.handle();
    assert.equal(result.verified, true);
    assert.equal(result.handled, true);
    assert.equal(paymentHandlerCalled, 1);
  });
});

describe('Paddle Classic event handlers', function () {
  function classicReq(method: string, body: any, contentType: string = 'application/json'): any {
    return {
      query: {},
      headers: { 'content-type': contentType },
      method,
      body,
    };
  }

  it('exposes the parsed Classic alert via onClassicEvent()', async () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_created' }),
    };
    const paddle = initialize('paddle-classic', classicReq('POST', JSON.stringify(createdPayload)));

    assert.equal(paddle.validPayload(), true);
    const event = await paddle.onClassicEvent();
    assert.isNotNull(event);
    assert.equal((event as any).alert_name, 'subscription_created');
  });

  it('filters subscription alerts through onClassicSubscriptionEvent()', async () => {
    const updatedPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_updated',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_updated' }),
    };
    const paddle = initialize('paddle-classic', classicReq('POST', JSON.stringify(updatedPayload)));

    const event = await paddle.onClassicSubscriptionEvent();
    assert.isNotNull(event);
    assert.equal((event as any).alert_name, 'subscription_updated');

    assert.isNull(await paddle.onBillingEvent());
    assert.isNull(await paddle.onBillingSubscriptionEvent());
  });

  it('returns null from onClassicSubscriptionEvent() for subscription payment alerts', async () => {
    const oneTimePayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_payment_succeeded',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_payment_succeeded' }),
    };
    const paddle = initialize('paddle-classic', classicReq('POST', JSON.stringify(oneTimePayload)));

    const event = await paddle.onClassicEvent();
    assert.isNotNull(event);
    assert.isNull(await paddle.onClassicSubscriptionEvent());
  });

  it('does not return Classic alerts from onBillingEvent()', async () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_created' }),
    };
    const paddle = initialize('paddle-classic', classicReq('POST', JSON.stringify(createdPayload)));

    assert.equal(paddle.validPayload(), true);
    assert.isNull(await paddle.onBillingEvent());
  });
});

describe('paddle-billing and paddle-classic provider entries', function () {
  it('routes initialize("paddle-billing", req) through the provider registry', () => {
    const rawBody = JSON.stringify({
      event_id: 'evt_provider_test',
      event_type: 'subscription.created',
      occurred_at: '2026-01-01T00:00:00Z',
      data: { id: 'sub_provider_test', status: 'active' },
    });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto
      .createHmac('sha256', BILLING_WEBHOOK_SECRET)
      .update(`${ts}:${rawBody}`)
      .digest('hex');
    const req = {
      query: {},
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${ts};h1=${h1}`,
      },
      body: rawBody,
    } as any;
    const billing = initialize('paddle-billing', req);

    assert.equal(billing.validRequest(), true);
    assert.equal(billing.validPayload(), true);
  });

  it('routes initialize("paddle-classic", req) through the provider registry', () => {
    const createdPayload = {
      ...validPayloadWithoutSignature,
      alert_name: 'subscription_created',
      p_signature: signPayload({ ...validPayloadWithoutSignature, alert_name: 'subscription_created' }),
    };
    const classic = initialize('paddle-classic', {
      query: {},
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createdPayload),
    } as any);

    assert.equal(classic.validRequest(), true);
    assert.equal(classic.validPayload(), true);
  });
});

describe('normalized provider statuses', function () {
  it('should map equivalent subscription statuses to the same normalized values', () => {
    assert.equal(mapProviderSubscriptionStatus('paddle', 'active'), SubscriptionStatus.Active);
    assert.equal(mapProviderSubscriptionStatus('stripe', 'active'), SubscriptionStatus.Active);
    assert.equal(mapProviderSubscriptionStatus('gumroad', 'alive'), SubscriptionStatus.Active);

    assert.equal(mapProviderSubscriptionStatus('paddle', 'past_due'), SubscriptionStatus.PastDue);
    assert.equal(mapProviderSubscriptionStatus('stripe', 'past_due'), SubscriptionStatus.PastDue);
    assert.equal(mapProviderSubscriptionStatus('gumroad', 'failed_payment'), SubscriptionStatus.PastDue);

    assert.equal(mapProviderSubscriptionStatus('paddle', 'deleted'), SubscriptionStatus.Canceled);
    assert.equal(mapProviderSubscriptionStatus('stripe', 'canceled'), SubscriptionStatus.Canceled);
    assert.equal(mapProviderSubscriptionStatus('gumroad', 'cancelled'), SubscriptionStatus.Canceled);
  });

  it('should map equivalent payment statuses to the same normalized values', () => {
    assert.equal(mapProviderPaymentStatus('paddle', 'subscription_payment_succeeded'), PaymentStatus.Paid);
    assert.equal(mapProviderPaymentStatus('stripe', 'succeeded'), PaymentStatus.Paid);
    assert.equal(mapProviderPaymentStatus('gumroad', 'successful'), PaymentStatus.Paid);

    assert.equal(mapProviderPaymentStatus('paddle', 'subscription_payment_failed'), PaymentStatus.Failed);
    assert.equal(mapProviderPaymentStatus('stripe', 'payment_failed'), PaymentStatus.Failed);
    assert.equal(mapProviderPaymentStatus('gumroad', 'failed'), PaymentStatus.Failed);

    assert.equal(mapProviderPaymentStatus('paddle', 'subscription_payment_refunded'), PaymentStatus.Refunded);
    assert.equal(mapProviderPaymentStatus('stripe', 'charge.refunded'), PaymentStatus.Refunded);
    assert.equal(mapProviderPaymentStatus('gumroad', 'refunded'), PaymentStatus.Refunded);
  });

  it('should include normalized and raw provider statuses on paddle events', async () => {
    const askriftPd = initialize('paddle', fromVercel(createReq('POST')));
    const event = await askriftPd.parseEvent();

    assert.equal(event?.subscriptionStatus, SubscriptionStatus.Active);
    assert.equal(event?.paymentStatus, PaymentStatus.Paid);
    const provider = event?.provider as ProviderStatusMetadata | undefined;
    assert.equal(provider?.name, 'paddle');
    assert.equal(provider?.raw.subscriptionStatus, 'active');
    assert.equal(provider?.raw.paymentStatus, 'subscription_payment_succeeded');
    assert.equal(event?.status, Status.Active);
    assert.equal((event?.raw as { alert_name?: string })?.alert_name, 'subscription_payment_succeeded');
  });

  it('should map paddle partial refunds to PartiallyRefunded', () => {
    assert.equal(
      mapProviderPaymentStatus('paddle', 'subscription_payment_refunded', 'partial'),
      PaymentStatus.PartiallyRefunded,
    );
  });

  it('should not assign payment status to paddle subscription events', async () => {
    const subscriptionCreatedPayload = { ...payload, alert_name: 'subscription_created', status: 'active' };
    const subscriptionUpdatedPayload = { ...payload, alert_name: 'subscription_updated', status: 'active' };
    const subscriptionCancelledPayload = { ...payload, alert_name: 'subscription_cancelled', status: 'deleted' };

    const createdAskrift = initialize('paddle', createReq('POST', signedPayload(subscriptionCreatedPayload)));
    const updatedAskrift = initialize('paddle', createReq('POST', signedPayload(subscriptionUpdatedPayload)));
    const cancelledAskrift = initialize('paddle', createReq('POST', signedPayload(subscriptionCancelledPayload)));

    const created = await createdAskrift.parseEvent();
    const updated = await updatedAskrift.parseEvent();
    const cancelled = await cancelledAskrift.parseEvent();

    assert.equal(created?.paymentStatus, undefined);
    assert.equal(updated?.paymentStatus, undefined);
    assert.equal(cancelled?.paymentStatus, undefined);

    assert.equal(created?.subscriptionStatus, SubscriptionStatus.Active);
    assert.equal(updated?.subscriptionStatus, SubscriptionStatus.Active);
    assert.equal(cancelled?.subscriptionStatus, SubscriptionStatus.Canceled);
  });
});
