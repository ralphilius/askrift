import Askrift, { initialize } from '../src';
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { assert } from 'chai';

const baseReq: any = {
  query: {},
  headers: {
    'content-type': 'application/x-www-form-urlencoded'
  },
};

const goodReq: any = {...baseReq, ...{
  method: 'POST',
  body: JSON.stringify({
    "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
    "p_signature": "ISCgCM7lyi/mFSGDa3uqssUJCgsHPC6/jXmBDiOl/t10ylzh24+ZSd5MUxqJ7h+0+wJLCk1HqAEg83tSBQ03PeZOC9mcwYnY2LfwksmE9KIyh4csyrQrACTMRBGrUNTh1z38RRQ2x88+8Jd+m5BDNoY4dBmUMf+qHQEhfEkrwjXiePe7JueEnWRClt/zBktihWJXEAH0ok7wZKIX4ZZ+vt4Q4rrKF8mYwqWO9CUtWPhUTYJSpKr/b7bASDY1ii0xQn9D0UYINyZ6Jh7EpkrXj9AMDDnCyaYwj3/NQ1iMmbnbwnThSGZO56KlcydabXZKkI3f0w7kt7LDtf2WvKxZtuHDGPHe1J0ugh6K4jPqOVW2YCePzw0NU5vo/0Y6rrqLyT0WCnPjD0RtedBeR+UFXblBfGsceGP/Z3Je3lcapF9G9a9j50odf0Cq1nN87lXZrqYh6fMIGcEC8myFHGWW/YHIp6HkvQxG3QlK9gtI+QA3ui8y7NirUp4wASPOj5TVBe371JpP8e0R1Fjv0yRKR2jMnw3+NAEQsUG3pGk4ragYMGxfR/+yHzQVpr3m94KoClvtkfQGJTFN10BQxM5mdMBFEQWEwdwwH7uozx2znczZgqVu1bYsyVU3vsY0DY9cxUISG1XHEmBzGXo8SF/hWj0BcdhIbUBNnOXqlJhNpjI=", "passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
  })
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
  let askriftBadPd: Askrift<'paddle'>;;
  it('should initalize successfully', (done) => {
    askriftPd = initialize('paddle', goodReq);
    askriftBadPd = initialize('paddle', badReq);
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

})