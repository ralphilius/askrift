import Askrift, { initialize } from '../src';
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { assert } from 'chai';
import * as crypto from "crypto";
import { serialize } from 'php-serialize';

const baseReq: any = {
  query: {},
  headers: {
    'content-type': 'application/x-www-form-urlencoded'
  },
};

const keyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.PADDLE_PUBLIC_KEY = keyPair.publicKey
  .replace('-----BEGIN PUBLIC KEY-----', '')
  .replace('-----END PUBLIC KEY-----', '')
  .replace(/\s/g, '');

function signPayload(payload: { [key: string]: string }): string {
  const orderedPayload = Object.keys(payload).sort().reduce((accumulator, key) => {
    accumulator[key] = payload[key];
    return accumulator;
  }, {} as { [key: string]: string });
  const signer = crypto.createSign('sha1');
  signer.update(serialize(orderedPayload));
  signer.end();

  return signer.sign(keyPair.privateKey).toString('base64');
}

const unsignedPayload = {
    "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
"passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
};

const validPayload = {
  ...unsignedPayload,
  p_signature: signPayload(unsignedPayload),
};

const goodReq: any = {...baseReq, ...{
  method: 'POST',
  body: JSON.stringify(validPayload)
}};

const urlEncodedReq: any = {...baseReq, ...{
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
  },
  body: new URLSearchParams(validPayload).toString()
}};

const badReq: any = {...baseReq, ...{
  method: 'GET',
  body: JSON.stringify({
    "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
    "p_signature": "badsign", "passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
  })
}};

describe('library works with paddle', function () {
  let askriftPd: Askrift<'paddle'>;
  let askriftBadPd: Askrift<'paddle'>;
  let askriftUrlEncodedPd: Askrift<'paddle'>;
  it('should initalize successfully', (done) => {
    askriftPd = initialize('paddle', goodReq);
    askriftBadPd = initialize('paddle', badReq);
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

})