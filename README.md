A small utilities library to make it easier to handle webhooks from popular subscription services

**Áskrift** means subscription in Icelandic

```bash
npm install @ralphilius/askrift # or yarn add @ralphilius/askrift
```

### Use on your server
Example using Vercel/NextJS serverless function
```js
import Askrift from '@ralphilius/askrift'

module.exports = (req, res) => {
  const askrift = Askrift.initialize("paddle", {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
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
| Gumroad | ![beta](https://img.shields.io/badge/status-beta-yellow) | HMAC-SHA256 using `GUMROAD_WEBHOOK_SECRET` and `x-gumroad-signature`/`x-signature` | sales, refunds, disputes, and subscription updates/cancellations |
| Lemon Squeezy | ![beta](https://img.shields.io/badge/status-beta-yellow) | HMAC-SHA256 using `LEMON_SQUEEZY_WEBHOOK_SECRET` and `x-signature` | subscription, order, payment, and refund events |
| Polar | ![beta](https://img.shields.io/badge/status-beta-yellow) | Standard Webhooks HMAC-SHA256 using `POLAR_WEBHOOK_SECRET` | subscription, order, payment, and refund events |
| Stripe | ![planned](https://img.shields.io/badge/status-planned-lightgrey) | Planned | Planned |
