import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import Askrift, { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent } from "./lib/askrift";
import Paddle, { PaddleOptions } from "./lib/paddle";

export default Askrift;
export { Paddle };
export { verifyPaddleSignature } from "./lib/paddle";
export { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent };
export * from "./types/events";
export type { PaddleSubscriptionEvents } from "./lib/paddle";

export type TypesMap = {
  paddle: Paddle;
};

export type InitializeOptions = PaddleOptions;

type ProviderRequest = VercelRequest | Request;
type ProviderConstructor<T extends keyof TypesMap> = new (request: ProviderRequest, options?: PaddleOptions | boolean) => Askrift<T>;

const providers: { [T in keyof TypesMap]: ProviderConstructor<T> } = {
  paddle: Paddle,
};

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported provider: ${provider}`);
    this.name = 'UnsupportedProviderError';
    Object.setPrototypeOf(this, UnsupportedProviderError.prototype);
  }
}

function resolveOptions(options?: InitializeOptions | boolean): PaddleOptions | boolean | undefined {
  if (typeof options === 'boolean') return options;
  return options;
}

export function initialize<T extends keyof TypesMap>(type: T, request: ProviderRequest, options?: InitializeOptions | boolean): Askrift<T>;
export function initialize(type: string, request: ProviderRequest, options?: InitializeOptions | boolean): Askrift<keyof TypesMap> {
  if (!Object.prototype.hasOwnProperty.call(providers, type)) {
    throw new UnsupportedProviderError(type);
  }

  const Provider = providers[type as keyof TypesMap];
  return new Provider(request, resolveOptions(options));
};
