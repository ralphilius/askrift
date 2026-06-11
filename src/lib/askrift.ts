import {
  NormalizedEventByType,
  NormalizedSubscriptionEvent,
  SUBSCRIPTION_EVENT_TYPES,
  SubscriptionEventType,
} from "../types/events";

type ProviderEventMap = Partial<Record<SubscriptionEventType, unknown>>;

type ProviderEvents<Events> = Events extends string
  ? Record<SubscriptionEventType, any>
  : Events extends ProviderEventMap
    ? Events
    : Record<SubscriptionEventType, NormalizedSubscriptionEvent>;

type ProviderEventPayload<Events, TType extends SubscriptionEventType> =
  TType extends keyof ProviderEvents<Events> ? ProviderEvents<Events>[TType] : NormalizedEventByType<TType>;

export default abstract class Askrift<Events extends ProviderEventMap | string = Record<SubscriptionEventType, NormalizedSubscriptionEvent>> {
  private _debug: boolean;

  constructor(debug?: boolean) {
    this._debug = debug || false;
  }

  public debug(msg: any, ...optionalParams: any[]) {
    if (this._debug) console.log(msg, ...optionalParams);
  }

  abstract validRequest(): boolean;

  validPayload(): boolean {
    return this.verify();
  }

  abstract verify(): boolean;
  abstract getEventType(): SubscriptionEventType | null;
  abstract toNormalizedEvent(): NormalizedSubscriptionEvent | null;

  parseEvent(): Promise<NormalizedSubscriptionEvent | null> {
    return Promise.resolve(this.toNormalizedEvent());
  }

  protected async getProviderEvent<TType extends SubscriptionEventType>(
    type: TType,
  ): Promise<ProviderEventPayload<Events, TType> | null> {
    const event = await this.parseEvent();
    if (event?.type !== type) return null;
    return event.raw as ProviderEventPayload<Events, TType>;
  }

  onSubscriptionCreated(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionCreated);
  }

  onSubscriptionCanceled(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionCancelled);
  }

  onSubscriptionUpdated(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.SubscriptionUpdated);
  }

  onPaymentSucceeded(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentSucceeded);
  }

  onPaymentFailed(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.PaymentFailed> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentFailed);
  }

  onPaymentRefunded(): Promise<ProviderEventPayload<Events, typeof SUBSCRIPTION_EVENT_TYPES.PaymentRefunded> | null> {
    return this.getProviderEvent(SUBSCRIPTION_EVENT_TYPES.PaymentRefunded);
  }
}
