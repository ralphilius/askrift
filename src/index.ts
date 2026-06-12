import Askrift, { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent } from "./lib/askrift";
import Paddle, { PaddleOptions, PaddleProviderKind } from "./lib/paddle";
import { fromExpress, fromRaw, fromVercel } from "./lib/request";
import type { InternalRequest, RequestHeaders } from "./lib/request";

export default Askrift;
export { Paddle };
export { verifyPaddleSignature } from "./lib/paddle";
export { fromExpress, fromRaw, fromVercel };
export { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent };
export * from "./types/events";
export type { InternalRequest, RequestHeaders } from "./lib/request";
export type { PaddleOptions, PaddleProviderKind, PaddleSubscriptionEvents } from "./lib/paddle";

export type TypesMap = {
  paddle: Paddle;
  'paddle-classic': Paddle;
  'paddle-billing': Paddle;
};

export type InitializeOptions = PaddleOptions;

type ProviderRequest = InternalRequest;
type ProviderConstructor<T extends keyof TypesMap> = new (request: InternalRequest, options?: PaddleOptions | boolean) => TypesMap[T];

const providers: { [T in keyof TypesMap]: ProviderConstructor<T> } = {
  paddle: Paddle,
  'paddle-classic': Paddle,
  'paddle-billing': Paddle,
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

export function initialize<T extends keyof TypesMap>(type: T, request: ProviderRequest, options?: InitializeOptions | boolean): TypesMap[T];
export function initialize(type: string, request: ProviderRequest, options?: InitializeOptions | boolean): TypesMap[keyof TypesMap] {
  if (!Object.prototype.hasOwnProperty.call(providers, type)) {
    throw new UnsupportedProviderError(type);
  }

  const Provider = providers[type as keyof TypesMap];
  const baseOptions = resolveOptions(options);
  const mergedOptions: PaddleOptions = {
    ...(typeof baseOptions === 'object' && baseOptions !== null ? baseOptions : {}),
    kind: type as PaddleProviderKind,
  };
  return new Provider(request, mergedOptions);
};
