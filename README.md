A small utilities library to make it easier to handle webhooks from popular subscription services.

**Áskrift** means subscription in Icelandic.

```bash
npm install @ralphilius/askrift # or yarn add @ralphilius/askrift
```

## Use on your server

Áskrift provider logic works with a small internal request shape instead of importing framework-specific request types:

```ts
type InternalRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Buffer | string;
}
```

Use an adapter helper to convert the request from your framework before calling `initialize`.

Áskrift can still be used with the provider-specific helpers (`validRequest()`,
`validPayload()`, `onSubscriptionCreated()`, and friends), but new integrations
can use the webhook dispatcher API:

```ts
askrift.on(eventName, handler);
const result = await askrift.handle();
```

`handle()` validates the request, verifies the payload signature, parses the
provider event, and invokes matching handlers. It returns a structured result:

```ts
{
  verified: boolean;
  handled: boolean;
  eventType?: string;
  errors?: Error[];
}
```

`handled` is `true` only when at least one matching handler was invoked AND none
of them threw. If any registered handler rejects, `handle()` catches the error,
records it in `result.errors`, and returns `handled: false` so callers can map
that to a 5xx response (instead of silently acknowledging a failed side effect).

Event handlers receive the parsed payload and a context object that includes the
normalized event name, the provider-specific event name, and the matched handler
name. Paddle webhooks support normalized event names such as
`subscription.created` and provider-specific names such as
`paddle.subscription_payment_succeeded`.

### Express example

```ts
import express from 'express';
import { initialize, fromExpress } from '@ralphilius/askrift';

const app = express();

app.post('/webhooks/paddle', express.urlencoded({ extended: false }), async (req, res) => {
  const askrift = initialize('paddle', fromExpress(req));

  askrift.on('subscription.created', async (payload, event) => {
    console.log('New subscription:', payload.subscription_id);
    console.log('Provider event:', event.providerEventType);
  });

  askrift.on('paddle.subscription_payment_succeeded', async (payload) => {
    console.log('Payment succeeded:', payload.subscription_payment_id);
  });

  const result = await askrift.handle();

  if (!result.verified) return res.status(403).json(result);
  if (!result.handled) return res.status(500).json(result);

  return res.status(200).json(result);
});
```

### Next.js API route example

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { initialize, fromVercel } from '@ralphilius/askrift';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const askrift = initialize('paddle', fromVercel(req));

  askrift.on('subscription.created', async (payload) => {
    console.log('New subscription:', payload.subscription_id);
  });

  askrift.on('paddle.subscription_cancelled', async (payload) => {
    console.log('Subscription cancelled:', payload.subscription_id);
  });

  const result = await askrift.handle();

  if (!result.verified) return res.status(403).json(result);

  return res.status(result.handled ? 200 : 202).json(result);
}
```

### Explicit configuration
Pass Paddle configuration directly to `initialize()` with an options object. `publicKey` can be either a full PEM public key or the body of the key without `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` headers.

```js
import { initialize, fromVercel } from '@ralphilius/askrift'

module.exports = (req, res) => {
  const askrift = initialize('paddle', fromVercel(req), {
    publicKey: process.env.PADDLE_PUBLIC_KEY,
    debug: process.env.NODE_ENV !== 'production',
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

### Environment variable fallback
For backward compatibility, Áskrift will still read `process.env.PADDLE_PUBLIC_KEY` when you do not pass `publicKey` in the options object.

```js
import { initialize, fromVercel } from '@ralphilius/askrift'

module.exports = (req, res) => {
  const askrift = initialize('paddle', fromVercel(req));

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

### Raw/internal request objects

If your framework is not covered by a dedicated helper, use `fromRaw` with the same minimal fields:

```ts
import { initialize, fromRaw } from '@ralphilius/askrift'

const request = fromRaw({
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: webhookBody,
})

const askrift = initialize('paddle', request)
```

The built-in adapters normalize header names to lowercase and pass through `body` and optional `rawBody` values.

### Legacy provider-specific helper example

```js
import { initialize, fromVercel } from '@ralphilius/askrift';

module.exports = (req, res) => {
  const askrift = initialize('paddle', fromVercel(req));

  if (askrift.validRequest()) {
    if (askrift.validPayload()) {
      askrift.onSubscriptionCreated().then(subscription => {
        // Handle subscription_created event
      });
      // Handle other events
    } else {
      // Invalid body, possibly leak of webhooks URL?
      res.status(403).end();
    }
  } else {
    res.status(400).end();
  }
};
```

## Supported Services

- Paddle
- Stripe (Coming soon)
- Gumroad (Coming soon)
