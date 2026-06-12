# Áskrift

A small TypeScript/JavaScript utilities library for validating and handling subscription webhooks from popular subscription services.

**Áskrift** means “subscription” in Icelandic.

## Installation

```bash
npm install @ralphilius/askrift
# or
# yarn add @ralphilius/askrift
# or
# pnpm add @ralphilius/askrift
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

### Idempotency keys and replay windows

Webhook providers often retry delivery, so your handler should accept the first delivery for a provider event and skip later deliveries with the same ID. Áskrift exposes the provider's stable event ID through a provider-neutral idempotency key:

```js
import { initialize } from '@ralphilius/askrift'

const askrift = initialize('paddle', req)

if (!askrift.validRequest() || !askrift.validPayload({ maxAgeMs: 5 * 60 * 1000 })) {
  res.status(400).end()
  return
}

const idempotencyKey = askrift.getIdempotencyKey()
// Paddle alert_id "120661188" becomes "paddle:120661188".
```

Normalized events returned from handlers expose the same `getIdempotencyKey()` method, plus timestamp helpers when a provider includes an event timestamp:

```js
const payment = await askrift.onPaymentSucceeded()

if (payment) {
  const idempotencyKey = payment.getIdempotencyKey()
  const eventTimestamp = payment.getEventTimestamp()
  const fresh = payment.isFresh({ maxAgeMs: 5 * 60 * 1000 })
}
```

Use `getIdempotencyKey()` with any store that can atomically reserve a key before your business logic runs:

```js
const payment = await askrift.onPaymentSucceeded()
if (!payment) return

const key = payment.getIdempotencyKey()
const ttlSeconds = 60 * 60 * 24 * 7

// Database example: create a table with a UNIQUE constraint on `key`.
try {
  await db.webhookDeliveries.create({ data: { key } })
} catch (error) {
  // Duplicate key violation means this event was already handled.
  return
}

// Redis example: SET key value NX EX ttlSeconds.
const reserved = await redis.set(key, '1', { NX: true, EX: ttlSeconds })
if (!reserved) return

// KV example: use an atomic insert/create-if-not-exists operation.
const created = await kv.set(key, '1', { ifNotExists: true, expirationTtl: ttlSeconds })
if (!created) return

// Safe to perform side effects after reserving the key.
await provisionSubscription(payment)
```

You can also call the standalone helper if you are working with a raw provider payload:

```js
import { extractStableEventId } from '@ralphilius/askrift'

const eventId = extractStableEventId('paddle', req.body)
```

## Supported services

| Provider | Status | Signature verification | Supported events |
| --- | --- | --- | --- |
| Paddle | Supported | RSA/SHA1 verification with `p_signature` and `PADDLE_PUBLIC_KEY` | `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_succeeded`, `subscription_payment_failed`, `subscription_payment_refunded` |
| Stripe | Coming soon | Not implemented | Not implemented |
| Gumroad | Coming soon | Not implemented | Not implemented |

## Provider support matrix

| Public method | Paddle event | Paddle support | Stripe support | Gumroad support |
| --- | --- | --- | --- | --- |
| `onSubscriptionCreated()` | `subscription_created` | ✅ | Planned | Planned |
| `onSubscriptionUpdated()` | `subscription_updated` | ✅ | Planned | Planned |
| `onSubscriptionCanceled()` | `subscription_cancelled` | ✅ | Planned | Planned |
| `onPaymentSucceeded()` | `subscription_payment_succeeded` | ✅ | Planned | Planned |
| `onPaymentFailed()` | `subscription_payment_failed` | ✅ | Planned | Planned |
| `onPaymentRefunded()` | `subscription_payment_refunded` | ✅ | Planned | Planned |

## Configuration

### Paddle

Áskrift currently requires Paddle’s public key at runtime.

```bash
PADDLE_PUBLIC_KEY="your-paddle-public-key-without-the-BEGIN-END-lines"
```

The library wraps the value with PEM headers internally, so store only the base64 key body. Both single-line keys and keys containing escaped newlines (`\n`) are supported.

You can optionally enable debug logging by passing `true` as the third argument to `initialize()` or the second argument to `new Paddle()`:

```ts
import { initialize } from '@ralphilius/askrift';

const askrift = initialize('paddle', req, true);
```

Do not enable debug logging in production unless you are comfortable with webhook payload data being written to your logs.

## Request body requirements

For Paddle webhooks, the request passed to Áskrift must include:

- `method: 'POST'`.
- A `content-type` header whose normalized value is `application/x-www-form-urlencoded`; parameters such as `charset=utf-8` are allowed.
- A `body` containing Paddle’s webhook fields, including `p_signature` and `alert_name`.
- A body representation that is either:
  - a parsed object,
  - a JSON string containing an object, or
  - a URL-encoded string such as the raw `application/x-www-form-urlencoded` body.

Recommended request handling order:

1. Construct the provider with the request: `const askrift = initialize('paddle', req)`.
2. Reject requests that fail `askrift.validRequest()`.
3. Reject requests that fail `askrift.validPayload()`.
4. Call the event method that matches the event you want to handle.

```ts
const askrift = initialize('paddle', req);

if (!askrift.validRequest()) {
  // Wrong HTTP method or content type.
  return;
}

if (!askrift.validPayload()) {
  // Invalid or missing Paddle signature.
  return;
}

const subscription = await askrift.onSubscriptionCreated();
if (subscription) {
  // Handle subscription_created.
}
```

## Provider setup

### Paddle dashboard

1. Add a webhook endpoint in Paddle that points to your server route.
2. Select the subscription events you want to receive.
3. Copy your Paddle public key from Paddle’s developer/webhook settings.
4. Store the public key in `PADDLE_PUBLIC_KEY` without the `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines.
5. Ensure your route accepts `POST` requests with `application/x-www-form-urlencoded` bodies.

### Future providers

Stripe and Gumroad are listed as future providers. Until they are implemented, `initialize('stripe', req)` and `initialize('gumroad', req)` are not supported. Future provider classes should expose the same public contract as `Askrift`: request validation, payload validation, debug logging, and event helpers that resolve either a provider-specific payload or `null` when the current event does not match the method.

## Usage examples

### Express

Paddle sends form-encoded webhook data. Use `express.urlencoded()` for the webhook route, and keep JSON parsing from changing the request before validation.

```ts
import express from 'express';
import { initialize } from '@ralphilius/askrift';

const app = express();

app.post('/webhooks/paddle', express.urlencoded({ extended: false }), async (req, res) => {
  const askrift = initialize('paddle', req);

  if (!askrift.validRequest()) {
    return res.status(400).send('Invalid webhook request');
  }

  if (!askrift.validPayload()) {
    return res.status(403).send('Invalid webhook signature');
  }

  const created = await askrift.onSubscriptionCreated();
  if (created) {
    // Handle Paddle subscription_created.
    return res.status(200).send('ok');
  }

  const updated = await askrift.onSubscriptionUpdated();
  if (updated) {
    // Handle Paddle subscription_updated.
    return res.status(200).send('ok');
  }

  const canceled = await askrift.onSubscriptionCanceled();
  if (canceled) {
    // Handle Paddle subscription_cancelled.
    return res.status(200).send('ok');
  }

  const paymentSucceeded = await askrift.onPaymentSucceeded();
  if (paymentSucceeded) {
    // Handle Paddle subscription_payment_succeeded.
    return res.status(200).send('ok');
  }

  const paymentFailed = await askrift.onPaymentFailed();
  if (paymentFailed) {
    // Handle Paddle subscription_payment_failed.
    return res.status(200).send('ok');
  }

  const paymentRefunded = await askrift.onPaymentRefunded();
  if (paymentRefunded) {
    // Handle Paddle subscription_payment_refunded.
    return res.status(200).send('ok');
  }

  return res.status(200).send('ignored');
});
```

### Next.js route handler (`app/api/.../route.ts`)

Next.js route handlers expose a Web `Request`, while Áskrift expects an Express/Vercel-like object containing `method`, `headers`, and `body`. Convert the form body into a plain object before calling `initialize()`.

```ts
import { initialize } from '@ralphilius/askrift';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();

  if (contentType !== 'application/x-www-form-urlencoded') {
    return new Response('Unsupported Media Type', { status: 415 });
  }

  let body: Record<string, string>;
  try {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } catch {
    return new Response('Invalid webhook payload', { status: 400 });
  }

  const req = {
    method: 'POST',
    headers: {
      'content-type': contentType,
    },
    body,
  };

  const askrift = initialize('paddle', req as any);

  if (!askrift.validRequest()) {
    return new Response('Invalid webhook request', { status: 400 });
  }

  if (!askrift.validPayload()) {
    return new Response('Invalid webhook signature', { status: 403 });
  }

  const paymentSucceeded = await askrift.onPaymentSucceeded();
  if (paymentSucceeded) {
    // Fulfill the order or extend access.
  }

  return new Response('ok', { status: 200 });
}
```

### Next.js Pages API route (`pages/api/...`) with Vercel-compatible requests

If you use a Pages API route, disable the built-in body parser and parse the raw form-encoded body yourself so the request shape stays predictable.

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { initialize } from '@ralphilius/askrift';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  req.body = await readBody(req);

  const askrift = initialize('paddle', req);

  if (!askrift.validRequest()) {
    return res.status(400).send('Invalid webhook request');
  }

  if (!askrift.validPayload()) {
    return res.status(403).send('Invalid webhook signature');
  }

  const canceled = await askrift.onSubscriptionCanceled();
  if (canceled) {
    // Revoke access or schedule cancellation handling.
  }

  return res.status(200).send('ok');
}
```

### Vercel serverless function

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initialize } from '@ralphilius/askrift';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const askrift = initialize('paddle', req);

  if (!askrift.validRequest()) {
    return res.status(400).send('Invalid webhook request');
  }

  if (!askrift.validPayload()) {
    return res.status(403).send('Invalid webhook signature');
  }

  const created = await askrift.onSubscriptionCreated();
  const paymentSucceeded = await askrift.onPaymentSucceeded();

  if (created) {
    // Provision the subscription.
  } else if (paymentSucceeded) {
    // Record a successful renewal/payment.
  }

  return res.status(200).send('ok');
}
```

### Framework-agnostic raw request

Use this pattern when your framework gives you raw HTTP request data or when you want to adapt another runtime to Áskrift’s expected request shape.

```ts
import { initialize } from '@ralphilius/askrift';

type RawWebhookRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
};

export async function handlePaddleWebhook(rawReq: RawWebhookRequest) {
  const req = {
    method: rawReq.method,
    headers: rawReq.headers,
    body: rawReq.rawBody,
  };

  const askrift = initialize('paddle', req as any);

  if (!askrift.validRequest()) {
    return { status: 400, body: 'Invalid webhook request' };
  }

  if (!askrift.validPayload()) {
    return { status: 403, body: 'Invalid webhook signature' };
  }

  const event =
    (await askrift.onSubscriptionCreated()) ||
    (await askrift.onSubscriptionUpdated()) ||
    (await askrift.onSubscriptionCanceled()) ||
    (await askrift.onPaymentSucceeded()) ||
    (await askrift.onPaymentFailed()) ||
    (await askrift.onPaymentRefunded());

  if (!event) {
    return { status: 200, body: 'ignored' };
  }

  // Dispatch by event.alert_name or pass the payload to your job queue.
  return { status: 200, body: 'ok' };
}
```

## Public API

### `initialize(type, body, debug?)`

Creates a provider instance.

| Argument | Type | Description |
| --- | --- | --- |
| `type` | `'paddle'` | Provider key. Only `'paddle'` is currently implemented. |
| `body` | `VercelRequest \| Express.Request` | Request-like object containing `method`, `headers`, and `body`. |
| `debug` | `boolean` | Optional. Enables provider debug logging when `true`. |

Returns an `Askrift<'paddle'>` instance backed by the Paddle provider.

### `Askrift<Provider>`

`Askrift` is the abstract base class and public contract implemented by each provider.

| Method | Returns | Description |
| --- | --- | --- |
| `validRequest()` | `boolean` | Checks request-level requirements such as HTTP method and content type. For Paddle, this requires `POST` and `application/x-www-form-urlencoded`. |
| `validPayload()` | `boolean` | Verifies provider-specific payload authenticity. For Paddle, this validates the `p_signature` field against `PADDLE_PUBLIC_KEY`. |
| `debug(msg, ...optionalParams)` | `void` | Writes to `console.log` only when debug mode is enabled. |
| `onSubscriptionCreated()` | `Promise<Payload \| null>` | Resolves the provider-specific subscription-created payload when the current event matches; otherwise resolves `null`. |
| `onSubscriptionUpdated()` | `Promise<Payload \| null>` | Resolves the provider-specific subscription-updated payload when the current event matches; otherwise resolves `null`. |
| `onSubscriptionCanceled()` | `Promise<Payload \| null>` | Resolves the provider-specific subscription-canceled payload when the current event matches; otherwise resolves `null`. |
| `onPaymentSucceeded()` | `Promise<Payload \| null>` | Resolves the provider-specific payment-succeeded payload when the current event matches; otherwise resolves `null`. |
| `onPaymentFailed()` | `Promise<Payload \| null>` | Resolves the provider-specific payment-failed payload when the current event matches; otherwise resolves `null`. |
| `onPaymentRefunded()` | `Promise<Payload \| null>` | Resolves the provider-specific payment-refunded payload when the current event matches; otherwise resolves `null`. |

### `Paddle`

`Paddle` implements `Askrift<'paddle'>`.

```ts
import Paddle from '@ralphilius/askrift/dist/lib/paddle';

const paddle = new Paddle(req, false);
```

Most consumers should prefer `initialize('paddle', req)` instead of importing the class directly.

| Constructor/method | Description |
| --- | --- |
| `new Paddle(req, debugged?)` | Creates a Paddle provider for a Vercel or Express request. Throws if `PADDLE_PUBLIC_KEY` is missing. |
| `validRequest()` | Returns `true` only for `POST` requests with `application/x-www-form-urlencoded` content type. |
| `validPayload()` | Parses the request body, removes `p_signature` from the signed payload copy, sorts the remaining fields, PHP-serializes them, and verifies the RSA/SHA1 signature. Returns `false` for missing, malformed, or invalid signatures. |
| `debug(msg, ...optionalParams)` | Logs debug output only when the provider was created with debug mode enabled. |
| `onSubscriptionCreated()` | Resolves a `SubscriptionCreated` payload when `alert_name === 'subscription_created'`; otherwise resolves `null`. |
| `onSubscriptionUpdated()` | Resolves a `SubscriptionUpdated` payload when `alert_name === 'subscription_updated'`; otherwise resolves `null`. |
| `onSubscriptionCanceled()` | Resolves a `SubscriptionCancelled` payload when `alert_name === 'subscription_cancelled'`; otherwise resolves `null`. |
| `onPaymentSucceeded()` | Resolves a `SubscriptionPaymentSucceeded` payload when `alert_name === 'subscription_payment_succeeded'`; otherwise resolves `null`. |
| `onPaymentFailed()` | Resolves a `SubscriptionPaymentFailed` payload when `alert_name === 'subscription_payment_failed'`; otherwise resolves `null`. |
| `onPaymentRefunded()` | Resolves a `SubscriptionPaymentRefunded` payload when `alert_name === 'subscription_payment_refunded'`; otherwise resolves `null`. |

### Future provider classes

Future providers should implement the complete `Askrift` public method set. Provider-specific event names may differ, but the public methods should keep the same meaning so application code can switch providers with minimal branching. A future provider should document:

- required environment variables or secrets,
- accepted request methods and content types,
- signature or authenticity checks performed by `validPayload()`,
- event names mapped to each `on...()` method,
- exact payload type returned by every event helper.

## Security notes

- Always call `validRequest()` and `validPayload()` before trusting webhook data or performing side effects.
- Keep `PADDLE_PUBLIC_KEY` in server-side environment variables only. Do not expose it to browser bundles or client-side logs.
- Return a non-2xx response for invalid signatures so webhook senders can surface delivery failures during setup.
- Treat webhook URLs as secrets. If a URL leaks, rotate it in your provider dashboard and deploy the new route.
- Make handlers idempotent. Providers may retry events, and duplicate webhook deliveries should not duplicate billing or provisioning side effects.
- Avoid logging full payloads in production because webhook bodies may contain emails, customer names, order IDs, and subscription identifiers.
- Restrict webhook routes to expected HTTP methods and content types. Áskrift checks this for Paddle, but infrastructure-level restrictions are still useful.

## Troubleshooting

### `validPayload()` returns `false` for an invalid signature

- Confirm that `PADDLE_PUBLIC_KEY` is the Paddle public key body without PEM header/footer lines.
- Confirm that the payload includes `p_signature` exactly as Paddle sent it.
- Do not modify, rename, or drop fields before validation.
- Ensure your endpoint is receiving the Paddle event you configured in the Paddle dashboard.

### `validRequest()` returns `false` for the wrong content type

- Paddle requests must use `application/x-www-form-urlencoded`.
- Content-type parameters are allowed, for example `application/x-www-form-urlencoded; charset=utf-8`.
- If your framework reports `application/json`, fix the webhook route or body parser configuration before calling Áskrift.

### `PADDLE_PUBLIC_KEY is required`

- Set `PADDLE_PUBLIC_KEY` in the server environment that runs the webhook handler.
- Restart or redeploy the application after adding the variable.
- Store the key without the PEM header and footer lines; Áskrift adds them internally.

### Body parser issues

- If `req.body` is `undefined`, add a route-level parser such as `express.urlencoded({ extended: false })` or read the raw body manually.
- If signature validation fails after parsing, confirm the parser preserves every field, including `p_signature`.
- For Next.js Pages API routes, disable the built-in body parser when you need raw request access.
- For Next.js route handlers, use `await request.formData()` and convert the result with `Object.fromEntries()`.

## License

MIT
