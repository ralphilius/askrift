import Askrift, { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent } from "./lib/askrift";
import Paddle, { PaddleOptions, PaddleProviderKind } from "./lib/paddle";
import Stripe, { StripeOptions } from "./lib/stripe";
import Gumroad, { GumroadOptions } from "./lib/gumroad";
import LemonSqueezy, { LemonSqueezyOptions } from "./lib/lemon-squeezy";
import Polar, { PolarOptions } from "./lib/polar";
import { fromExpress, fromRaw, fromVercel } from "./lib/request";
import type { InternalRequest, RequestHeaders } from "./lib/request";

export default Askrift;
export { Paddle, Stripe, Gumroad, LemonSqueezy, Polar };
export { verifyPaddleSignature } from "./lib/paddle";
export { fromExpress, fromRaw, fromVercel };
export { AskriftEventContext, AskriftEventHandler, AskriftHandleResult, AskriftParsedEvent };
export * from "./types/events";
export * from "./types/stripe";
export * from "./types/gumroad/subscription";
export * from "./types/lemon-squeezy/subscription";
export * from "./types/polar/subscription";
export type { InternalRequest, RequestHeaders } from "./lib/request";
export type { PaddleOptions, PaddleProviderKind, PaddleSubscriptionEvents } from "./lib/paddle";
export type { StripeOptions } from "./lib/stripe";
export type { GumroadOptions } from "./lib/gumroad";
export type { LemonSqueezyOptions } from "./lib/lemon-squeezy";
export type { PolarOptions } from "./lib/polar";

export type TypesMap = {
  paddle: Paddle;
  stripe: Stripe;
  'paddle-classic': Paddle;
  'paddle-billing': Paddle;
  gumroad: Gumroad;
  'lemon-squeezy': LemonSqueezy;
  polar: Polar;
};

export type InitializeOptions = PaddleOptions & Partial<StripeOptions> & Partial<GumroadOptions> & Partial<LemonSqueezyOptions> & Partial<PolarOptions>;

type ProviderRequest = InternalRequest;
type ProviderConstructor<T extends keyof TypesMap> = new (request: InternalRequest, options?: InitializeOptions | boolean) => TypesMap[T];

const providers: { [T in keyof TypesMap]: ProviderConstructor<T> } = {
  paddle: Paddle,
  'paddle-classic': Paddle,
  'paddle-billing': Paddle,
  stripe: Stripe,
  gumroad: Gumroad,
  'lemon-squeezy': LemonSqueezy,
  polar: Polar,
};

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported provider: ${provider}`);
    this.name = 'UnsupportedProviderError';
    Object.setPrototypeOf(this, UnsupportedProviderError.prototype);
  }
}

function resolveOptions(options?: InitializeOptions | boolean): InitializeOptions | boolean | undefined {
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
  const debugOption = typeof baseOptions === 'boolean' ? { debug: baseOptions } : {};
  const mergedOptions = {
    ...debugOption,
    ...(typeof baseOptions === 'object' && baseOptions !== null ? baseOptions : {}),
    ...(type === 'paddle' || type === 'paddle-classic' || type === 'paddle-billing' ? { kind: type as PaddleProviderKind } : {}),
  } as InitializeOptions;
  return new Provider(request, mergedOptions);
};

export { extractStableEventId, extractEventTimestamp, isEventFresh, normalizeWebhookEvent } from "./lib/idempotency";
export type { EventTimestampValidationOptions, NormalizedWebhookEvent, WebhookProvider } from "./lib/idempotency";
