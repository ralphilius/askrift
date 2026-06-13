import Askrift, { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent } from "./lib/askrift";
import Paddle, { PaddleOptions, PaddleProviderKind } from "./lib/paddle";
import Stripe, { StripeOptions } from "./lib/stripe";
import { fromExpress, fromRaw, fromVercel } from "./lib/request";
import type { InternalRequest, RequestHeaders } from "./lib/request";

export default Askrift;
export { Paddle, Stripe };
export { verifyPaddleSignature } from "./lib/paddle";
export { fromExpress, fromRaw, fromVercel };
export { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent };
export * from "./types/events";
export * from "./types/stripe";
export type { InternalRequest, RequestHeaders } from "./lib/request";
export type { PaddleOptions, PaddleProviderKind, PaddleSubscriptionEvents } from "./lib/paddle";
export type { StripeOptions } from "./lib/stripe";

export type TypesMap = {
  paddle: Paddle;
  stripe: Stripe;
  'paddle-classic': Paddle;
  'paddle-billing': Paddle;
};

export type InitializeOptions = PaddleOptions & Partial<StripeOptions>;

type ProviderRequest = InternalRequest;
type ProviderConstructor<T extends keyof TypesMap> = new (request: InternalRequest, options?: PaddleOptions & Partial<StripeOptions> | boolean) => TypesMap[T];

const providers: { [T in keyof TypesMap]: ProviderConstructor<T> } = {
  paddle: Paddle,
  'paddle-classic': Paddle,
  'paddle-billing': Paddle,
  stripe: Stripe,
};

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported provider: ${provider}`);
    this.name = 'UnsupportedProviderError';
    Object.setPrototypeOf(this, UnsupportedProviderError.prototype);
  }
}

function resolveOptions(options?: InitializeOptions | boolean): (PaddleOptions & Partial<StripeOptions>) | boolean | undefined {
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
  const mergedOptions: PaddleOptions & Partial<StripeOptions> = {
    ...(typeof baseOptions === 'object' && baseOptions !== null ? baseOptions : {}),
    ...(type === 'stripe' ? {} : { kind: type as PaddleProviderKind }),
  };
  return new Provider(request, mergedOptions);
};

export { extractStableEventId, extractEventTimestamp, isEventFresh, normalizeWebhookEvent } from "./lib/idempotency";
export type { EventTimestampValidationOptions, NormalizedWebhookEvent, WebhookProvider } from "./lib/idempotency";
