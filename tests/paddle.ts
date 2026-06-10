import Askrift, { initialize, UnsupportedProviderError } from '../src';
import * as crypto from 'crypto';
import { serialize } from 'php-serialize';
import { assert } from 'chai';

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

const payload = {
  "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
  "passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
};

function ksort(obj: { [k: string]: any }) {
  const keys = Object.keys(obj).sort();
  let sortedObj: { [k: string]: any } = {};
  for (let i in keys) {
    sortedObj[keys[i]] = obj[keys[i]];
  }
  return sortedObj;
}

function signedPayload(fields: { [k: string]: any }) {
  const jsonObj = ksort({ ...fields });
  for (let property in jsonObj) {
    if (jsonObj.hasOwnProperty(property) && (typeof jsonObj[property]) !== "string") {
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

function createReq(method: string, body = signedPayload(payload)): any {
  return {
    ...baseReq,
    method,
    body,
  };
}

describe('library works with paddle', function () {
  let askriftPd: Askrift<'paddle'>;
  let askriftBadPd: Askrift<'paddle'>;

  it('should initalize successfully', (done) => {
    askriftPd = initialize('paddle', createReq('POST'));
    askriftBadPd = initialize('paddle', createReq('GET', JSON.stringify({ ...payload, p_signature: 'badsign' })));
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

  it('should not pass invalid request', (done) => {
    assert.equal(askriftBadPd.validRequest(), false);
    done();
  });

  it('should not pass invalid payload', (done) => {
    assert.equal(askriftBadPd.validPayload(), false);
    done();
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
      () => initialize('stripe', createReq('POST')),
      UnsupportedProviderError,
      'Unsupported provider: stripe'
    );
  });

  it('throws UnsupportedProviderError for unsupported object prototype keys', () => {
    assert.throws(
      () => initialize('__proto__', createReq('POST')),
      UnsupportedProviderError,
      'Unsupported provider: __proto__'
    );
  });
});
