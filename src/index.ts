import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import Askrift from "./lib/askrift";
import Paddle from "./lib/paddle";

export default Askrift;
export { Paddle };
export * from "./types/events";
export type { PaddleSubscriptionEvents } from "./lib/paddle";

export type TypesMap = {
  paddle: Paddle;
};

export function initialize<T extends keyof TypesMap>(type: T, body: VercelRequest | Request, debug?: boolean): TypesMap[T] {
  switch (type) {
    case 'paddle':
      return new Paddle(body, debug) as TypesMap[T];
    default:
      throw new Error(`Unsupported provider: ${type}`);
  }
};
