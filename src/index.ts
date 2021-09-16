import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import Askrift, { TypesMap } from "./lib/askrift";
import Paddle from "./lib/paddle";

export default Askrift;

export function initialize<T extends keyof TypesMap>(type: T, body: VercelRequest | Request, debug?: boolean): Askrift<T> {
  return new Paddle(body, debug);
};