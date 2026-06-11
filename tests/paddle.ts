import Askrift, { initialize, UnsupportedProviderError } from '../src';
import * as crypto from 'crypto';
import { serialize } from 'php-serialize';
import { assert } from 'chai';
import { verifyPaddleSignature } from '../src/lib/paddle';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

process.env.PADDLE_PUBLIC_KEY = publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .replace('-----BEGIN PUBLIC KEY-----', '')
  .replace('-----END PUBLIC KEY-----', '')
  .replace(/\s+/g, '');

const baseReq: any = {
  query: {},
  headers: {
    'content-type': 'application/x-www-form-urlencoded'
  },
};

const paddlePublicKey = `-----BEGIN PUBLIC KEY-----\n${process.env.PADDLE_PUBLIC_KEY}\n-----END PUBLIC KEY-----`;

const payload = {
  "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
  "passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
};

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

  for (let property in signingPayload) {
    if (signingPayload.hasOwnProperty(property) && (typeof signingPayload[property]) !== 'string') {
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

function reqFor(method: string, body: any): any {
  return {
    ...baseReq,
    method,
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

describe('library works with paddle', function () {
  let askriftPd: Askrift<'paddle'>;
  let askriftBadPd: Askrift<'paddle'>;
  let askriftUrlEncodedPd: Askrift<'paddle'>;

  it('should initalize successfully', (done) => {
    askriftPd = initialize('paddle', createReq('POST'));
    askriftBadPd = initialize('paddle', createReq('GET', JSON.stringify({ ...payload, p_signature: 'badsign' })));
    askriftUrlEncodedPd = initialize('paddle', urlEncodedReq);
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

  it('should not pass invalid request', (done) => {
    assert.equal(askriftBadPd.validRequest(), false);
    done();
  });

  it('should not pass invalid payload', (done) => {
    assert.equal(askriftBadPd.validPayload(), false);
    done();
  });

  it('should return consistent results when validPayload is called multiple times', () => {
    const req = reqFor('POST', { ...validPayload });
    const paddle = initialize('paddle', req);

    assert.equal(paddle.validPayload(), true);
    assert.equal(paddle.validPayload(), true);
  });

  it('should not remove p_signature from object request bodies after verification', () => {
    const body = { ...validPayload };
    const originalBody = JSON.parse(JSON.stringify(body));
    const paddle = initialize('paddle', reqFor('POST', body));

    assert.equal(paddle.validPayload(), true);
    assert.deepEqual(body, originalBody);
  });

  it('should not replace string request bodies after verification', () => {
    const body = JSON.stringify(validPayload);
    const req = reqFor('POST', body);
    const paddle = initialize('paddle', req);

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
    assert.equal(initialize('paddle', reqFor('POST', { ...validPayloadWithoutSignature })).validPayload(), false);
  });

  it('should reject malformed signatures', () => {
    const body = {
      ...validPayloadWithoutSignature,
      p_signature: 'not a valid paddle signature',
    };

    assert.equal(verifyPaddleSignature(body, paddlePublicKey), false);
    assert.equal(initialize('paddle', reqFor('POST', body)).validPayload(), false);
  });

  it('should reject non-object payloads', () => {
    assert.equal(verifyPaddleSignature(null, paddlePublicKey), false);
    assert.equal(verifyPaddleSignature('not an object', paddlePublicKey), false);
    assert.equal(initialize('paddle', reqFor('POST', JSON.stringify(null))).validPayload(), false);
    assert.equal(initialize('paddle', reqFor('POST', JSON.stringify('not an object'))).validPayload(), false);
  });
});

describe('provider registry initialization', function () {
  it('dispatches paddle through the provider registry', async () => {
    const askriftPd = initialize('paddle', createReq('POST'));

    assert.equal(askriftPd.validRequest(), true);
    assert.equal(askriftPd.validPayload(), true);
    assert.deepInclude(await askriftPd.onPaymentSucceeded(), {
      alert_name: 'subscription_payment_succeeded',
      subscription_id: '8',
    });
    assert.equal(await askriftPd.onSubscriptionCreated(), null);
  });

  it('supports the existing boolean debug argument for paddle users', () => {
    const askriftPd = initialize('paddle', createReq('POST'), true);

    assert.equal(askriftPd.validRequest(), true);
  });

  it('supports the options object debug argument for paddle users', () => {
    const askriftPd = initialize('paddle', createReq('POST'), { debug: true });

    assert.equal(askriftPd.validRequest(), true);
  });

  it('throws UnsupportedProviderError for unsupported providers', () => {
    assert.throws(
      () => initialize('stripe' as any, createReq('POST')),
      UnsupportedProviderError,
      'Unsupported provider: stripe'
    );
  });

  it('throws UnsupportedProviderError for unsupported object prototype keys', () => {
    assert.throws(
      () => initialize('__proto__' as any, createReq('POST')),
      UnsupportedProviderError,
      'Unsupported provider: __proto__'
    );
  });
});

describe('handle() propagates handler failures', function () {
  it('reports a thrown handler error and returns handled: false', async () => {
    const askriftPd = initialize('paddle', createReq('POST'));
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
    const askriftPd = initialize('paddle', createReq('POST'));

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
    const askriftPd = initialize('paddle', createReq('POST'));
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
