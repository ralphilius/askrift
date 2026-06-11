import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import Askrift, { TypesMap } from "./lib/askrift";
import Paddle from "./lib/paddle";

export default Askrift;

export type InitializeOptions = {
  debug?: boolean;
};

type ProviderRequest = VercelRequest | Request;
type ProviderConstructor<T extends keyof TypesMap> = new (request: ProviderRequest, debug?: boolean) => Askrift<T>;

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

function resolveDebugOption(options?: InitializeOptions | boolean): boolean | undefined {
  if (typeof options === 'boolean') return options;
  return options?.debug;
}

export function initialize<T extends keyof TypesMap>(type: T, request: ProviderRequest, options?: InitializeOptions | boolean): Askrift<T>;
export function initialize(type: string, request: ProviderRequest, options?: InitializeOptions | boolean): Askrift<keyof TypesMap> {
  if (!Object.prototype.hasOwnProperty.call(providers, type)) {
    throw new UnsupportedProviderError(type);
  }

  const Provider = providers[type as keyof TypesMap];
  return new Provider(request, resolveDebugOption(options));
};
