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

### Stripe
Set your Stripe webhook signing secret before initializing the handler:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe validates signatures against the raw JSON payload. In frameworks that parse JSON before
calling your handler, keep the raw body available as `req.rawBody` or pass the unmodified JSON
string as `req.body`.

Example using a Vercel/NextJS serverless function:

```js
import { initialize } from '@ralphilius/askrift'

module.exports = async (req, res) => {
  const askrift = initialize("stripe", req);

  if (!askrift.validRequest()) {
    res.status(400).end();
    return;
  }

  if (!askrift.validPayload()) {
    res.status(403).end();
    return;
  }

  const created = await askrift.onSubscriptionCreated();
  if (created) {
    // Handle customer.subscription.created
  }

  const updated = await askrift.onSubscriptionUpdated();
  if (updated) {
    // Handle customer.subscription.updated
  }

  const canceled = await askrift.onSubscriptionCanceled();
  if (canceled) {
    // Handle customer.subscription.deleted
  }

  const paymentSucceeded = await askrift.onPaymentSucceeded();
  if (paymentSucceeded) {
    // Handle invoice.payment_succeeded
  }

  const paymentFailed = await askrift.onPaymentFailed();
  if (paymentFailed) {
    // Handle invoice.payment_failed
  }

  res.status(200).end();
}
```

You can also access Stripe-specific helpers by importing `Stripe` and casting the initialized
handler when you need a normalized event payload:

```js
import { initialize, Stripe } from '@ralphilius/askrift'

const askrift = initialize("stripe", req);
if (askrift.validPayload()) {
  const normalized = /** @type {Stripe} */ (askrift).getNormalizedEvent();
  // normalized.type is one of:
  // subscription.created, subscription.updated, subscription.deleted,
  // payment.succeeded, payment.failed
}
```

### Supported Services
 - Paddle
 - Stripe
 - Gumroad (Coming soon)
