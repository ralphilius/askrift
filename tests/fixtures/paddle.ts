export const paddlePaymentSucceededPayload = {
  "alert_id": "120661188", "alert_name": "subscription_payment_succeeded", "balance_currency": "GBP", "balance_earnings": "990.07", "balance_fee": "99.44", "balance_gross": "570.99", "balance_tax": "213.9", "checkout_id": "7-8ed52238d1752b0-72f9b4c4b7", "country": "AU", "coupon": "Coupon 8", "currency": "GBP", "customer_name": "customer_name", "earnings": "850.26", "email": "mitchell.ollie@example.org", "event_time": "2021-09-10 10:36:39", "fee": "0.77", "initial_payment": "false", "instalments": "3", "marketing_consent": "", "next_bill_date": "2021-09-25", "next_payment_amount": "next_payment_amount", "order_id": "8",
  "passthrough": "Example String", "payment_method": "card", "payment_tax": "0.12", "plan_name": "Example String", "quantity": "21", "receipt_url": "https://my.paddle.com/receipt/8/485212962ae4daf-2e58a66474", "sale_gross": "463.62", "status": "active", "subscription_id": "8", "subscription_payment_id": "7", "subscription_plan_id": "6", "unit_price": "unit_price", "user_id": "4"
};

export const paddlePaymentSucceededDuplicatePayload = {
  ...paddlePaymentSucceededPayload,
  "email": "duplicate-delivery@example.org",
};

export const paddleStalePaymentSucceededPayload = {
  ...paddlePaymentSucceededPayload,
  "event_time": "2021-01-01 00:00:00",
};
