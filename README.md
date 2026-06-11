A small utilities library to make it easier to handle webhooks from popular subscription services

**Áskrift** means subscription in Icelandic

```bash
npm install @ralphilius/askrift # or yarn add @ralphilius/askrift
```

### Use on your server
Example using Vercel/NextJS serverless function with Paddle:
```js
import { initialize } from '@ralphilius/askrift'

module.exports = (req, res) => {
  const askrift = initialize("paddle", req);
  if(askrift.validRequest()){
    if(askrift.validPayload()){
      askrift.onSubscriptionCreated().then(subscription => {
        // Handle subscription_created event
      })
    // Handle other events
    } else {
      // Invalid body, possibly leak of webhooks URL?
      res.status(403).end();
    }
  } else {
    res.status(400).end();
  }
}

```

### Supported Services

| Service | Status | Webhook verification | Normalized lifecycle events |
| --- | --- | --- | --- |
| Paddle | ![stable](https://img.shields.io/badge/status-stable-brightgreen) | RSA/SHA1 payload signatures | subscriptions and subscription payments |
| Stripe | ![stable](https://img.shields.io/badge/status-stable-brightgreen) | HMAC-SHA256 with timestamp tolerance using `STRIPE_WEBHOOK_SECRET` and `stripe-signature` | `customer.subscription.*` and `invoice.payment_*` events normalized to the framework's subscription/payment lifecycle |
| Gumroad | ![beta](https://img.shields.io/badge/status-beta-yellow) | Optional HMAC-SHA256 using `GUMROAD_WEBHOOK_SECRET` and `x-gumroad-signature`/`x-signature` (set `requireSignature: true` to enforce) | sales, refunds, disputes, and subscription updates/cancellations |
| Lemon Squeezy | ![beta](https://img.shields.io/badge/status-beta-yellow) | HMAC-SHA256 using `LEMON_SQUEEZY_WEBHOOK_SECRET` and `x-signature` | subscription, order, payment, and refund events |
| Polar | ![beta](https://img.shields.io/badge/status-beta-yellow) | Standard Webhooks HMAC-SHA256 using `POLAR_WEBHOOK_SECRET` (`whsec_*` secrets supported) | subscription, order, payment, and refund events |
