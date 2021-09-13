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
  const askrift = Askrift.initialize("paddle", req.body);
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
 - Paddle
 - Stripe (Coming soon)
 - Gumroad (Coming soon)