import { VercelRequest } from "@vercel/node";
import * as crypto from "crypto";
import Serialize from 'php-serialize';

// Public key from your paddle dashboard
const pubKey = `-----BEGIN PUBLIC KEY-----
${process.env.PADDLE_PUBLIC_KEY}
-----END PUBLIC KEY-----`

function ksort(obj: { [k: string]: any }) {
  const keys = Object.keys(obj).sort();
  let sortedObj: { [k: string]: any } = {};
  for (let i in keys) {
    sortedObj[keys[i]] = obj[keys[i]];
  }
  return sortedObj;
}

export function validPayload(jsonObj: any): boolean {
  if (!process.env.PADDLE_PUBLIC_KEY) throw "PADDLE_PUBLIC_KEY is required";
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
  const serialized = Serialize.serialize(jsonObj);
  const verifier = crypto.createVerify('sha1');
  verifier.update(serialized);
  verifier.end();

  const verification = verifier.verify(pubKey, mySig);
  return verification;
}

export function validRequest(request: VercelRequest): boolean {
  return request.method == 'POST' && request.headers['content-type'] == 'application/x-www-form-urlencoded';
}