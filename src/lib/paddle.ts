import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import * as crypto from "crypto";
import { serialize } from 'php-serialize';
import Askrift from "./askrift";
import { SubscriptionCancelled, SubscriptionCreated, SubscriptionPaymentFailed, SubscriptionPaymentRefunded, SubscriptionPaymentSucceeded, SubscriptionUpdated } from "../types/paddle/subscription";
import { isObject } from "./utils";

function ksort(obj: { [k: string]: any }) {
  const keys = Object.keys(obj).sort();
  let sortedObj: { [k: string]: any } = {};
  for (let i in keys) {
    sortedObj[keys[i]] = obj[keys[i]];
  }
  return sortedObj;
}

function promisify<T>(obj: any, key: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    if (isObject(obj)) {
      if (obj['alert_name'] == key) {
        resolve(obj as T);
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
    return this._req.method == 'POST' && this._req.headers['content-type'] == 'application/x-www-form-urlencoded';
  }

  validPayload(): boolean {
    try {
      if (typeof this._req.body == 'string') this._req.body = JSON.parse(this._req.body);
    } catch (error) {
      this.debug(error);
      return false;
    }
    
    this.debug("PADDLE_PUBLIC_KEY", this._pubKey);
    let jsonObj = (this._req as any).body;
    // Grab p_signature
    const mySig = Buffer.from(jsonObj.p_signature, 'base64');
    // Remove p_signature from object - not included in array of fields used in verification.
    delete jsonObj.p_signature;
    // Need to sort array by key in ascending order
    jsonObj = ksort(jsonObj);
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

    const verification = verifier.verify(this._pubKey, mySig);
    return verification;
  }
}