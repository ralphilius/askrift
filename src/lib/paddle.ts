import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import * as crypto from "crypto";
import { serialize } from 'php-serialize';
import Askrift from "./askrift";
import { SubscriptionCancelled, SubscriptionCreated, SubscriptionPaymentFailed, SubscriptionPaymentRefunded, SubscriptionPaymentSucceeded, SubscriptionUpdated } from "../types/paddle/subscription";
import { isObject } from "./utils";

type PaddlePayload = { [k: string]: any };

function ksort(obj: PaddlePayload) {
  const keys = Object.keys(obj).sort();
  let sortedObj: PaddlePayload = {};
  for (let i in keys) {
    sortedObj[keys[i]] = obj[keys[i]];
  }
  return sortedObj;
}

function parseBody(body: any): PaddlePayload | null {
  if (isObject(body) && !Array.isArray(body)) return body;
  if (typeof body !== 'string') return null;

  try {
    const parsed = JSON.parse(body);
    return isObject(parsed) ? parsed : null;
  } catch (error) {
    if (!body.includes('=')) return null;
    const params = new URLSearchParams(body);
    const payload: PaddlePayload = {};
    params.forEach((value, key) => {
      payload[key] = value;
    });

    return Object.keys(payload).length > 0 ? payload : null;
  }
}

function normalizeContentType(contentType: string | string[] | undefined): string {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.split(';')[0].trim().toLowerCase() || '';
}

function promisify<T>(obj: any, key: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const payload = parseBody(obj);
    if (payload) {
      if (payload['alert_name'] == key) {
        resolve(payload as T);
      } else {
        resolve(null)
      }
    } else {
      reject("Invalid body")
    }
  });
}

export default class Paddle extends Askrift<"paddle"> {
  private _req;
  private _pubKey: string;
  constructor(req: VercelRequest | Request, debugged?: boolean) {
    super(debugged);
    if (!process.env.PADDLE_PUBLIC_KEY) throw "PADDLE_PUBLIC_KEY is required";
    this._req = req;
    this._pubKey = `-----BEGIN PUBLIC KEY-----\n${process.env.PADDLE_PUBLIC_KEY?.replace(/\\n/g, '\n')}\n-----END PUBLIC KEY-----`
  }

  onSubscriptionCreated(): Promise<SubscriptionCreated | null> {
    return promisify(this._req.body, 'subscription_created');
  }

  onSubscriptionCanceled(): Promise<SubscriptionCancelled | null> {
    return promisify(this._req.body, 'subscription_cancelled');
  }

  onSubscriptionUpdated(): Promise<SubscriptionUpdated | null> {
    return promisify(this._req.body, 'subscription_updated');
  }

  onPaymentSucceeded(): Promise<SubscriptionPaymentSucceeded | null> {
    return promisify(this._req.body, 'subscription_payment_succeeded');
  }

  onPaymentFailed(): Promise<SubscriptionPaymentFailed | null> {
    return promisify(this._req.body, 'subscription_payment_failed');
  }
  
  onPaymentRefunded(): Promise<SubscriptionPaymentRefunded | null> {
    return promisify(this._req.body, 'subscription_payment_refunded');
  }

  validRequest(): boolean {
    return this._req.method == 'POST' && normalizeContentType(this._req.headers['content-type']) == 'application/x-www-form-urlencoded';
  }

  validPayload(): boolean {
    this.debug(this._req.body);
    const payload = parseBody(this._req.body);
    if (!payload || typeof payload.p_signature !== 'string') return false;
    if (typeof this._req.body === 'string') {
      this._req.body = payload;
    }

    this.debug("PADDLE_PUBLIC_KEY", this._pubKey);
    // Keep the original request body intact for event handlers while verifying
    // a copy without p_signature, as required by Paddle.
    const { p_signature, ...unsignedPayload } = payload;
    let jsonObj = ksort(unsignedPayload);
    for (let property in jsonObj) {
      if (jsonObj.hasOwnProperty(property) && (typeof jsonObj[property]) !== "string") {
        if (Array.isArray(jsonObj[property])) { // is it an array
          jsonObj[property] = jsonObj[property].toString();
        } else { //if its not an array and not a string, then it is a JSON obj
          jsonObj[property] = JSON.stringify(jsonObj[property]);
        }
      }
    }
    // Serialise remaining fields of jsonObj
    const serialized = serialize(jsonObj);
    const verifier = crypto.createVerify('sha1');
    verifier.update(serialized);
    verifier.end();

    try {
      const mySig = Buffer.from(p_signature, 'base64');
      return verifier.verify(this._pubKey, mySig);
    } catch (error) {
      this.debug(error);
      return false;
    }
  }
}
