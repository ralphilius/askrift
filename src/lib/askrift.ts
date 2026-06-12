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

export type AskriftHandleResult = {
  verified: boolean;
  handled: boolean;
  eventType?: string;
  errors?: Error[];
};

export type AskriftEventContext<EventPayload = any> = {
  eventType: string;
  matchedEventName: string;
  payload: EventPayload;
  provider?: string;
  providerEventType?: string;
};

export type AskriftEventHandler<EventPayload = any> = (
  payload: EventPayload,
  context: AskriftEventContext<EventPayload>
) => void | Promise<void>;

export type AskriftParsedEvent<EventPayload = any> = {
  eventType: string;
  payload: EventPayload;
  provider?: string;
  providerEventType?: string;
  aliases?: string[];
};

export default abstract class Askrift<Events extends ProviderEventMap | string = Record<SubscriptionEventType, NormalizedSubscriptionEvent>> {
  private _debug: boolean;
  private _handlers: Map<string, AskriftEventHandler[]>;

  constructor(debug?: boolean) {
    this._debug = debug || false;
    this._handlers = new Map();
  }

  public on<EventPayload = any>(eventName: string, handler: AskriftEventHandler<EventPayload>): this {
    const normalizedName = this.normalizeEventName(eventName);
    const handlers = this._handlers.get(normalizedName) || [];
    handlers.push(handler as AskriftEventHandler);
    this._handlers.set(normalizedName, handlers);
    return this;
  }

  public async handle(): Promise<AskriftHandleResult> {
    const verified = this.validRequest() && this.validPayload();

    if (!verified) {
      return { verified: false, handled: false };
    }

    const event = this.parseProviderEvent();

    if (!event) {
      return { verified: true, handled: false };
    }

    const eventNames = this.getDispatchNames(event);
    const called = new Set<AskriftEventHandler>();
    const errors: Error[] = [];
    let handled = false;

    for (const eventName of eventNames) {
      const handlers = this._handlers.get(eventName);

      if (!handlers || handlers.length === 0) continue;

      handled = true;
      for (const handler of handlers) {
        if (called.has(handler)) continue;
        called.add(handler);
        try {
          await handler(event.payload, {
            eventType: event.eventType,
            matchedEventName: eventName,
            payload: event.payload,
            provider: event.provider,
            providerEventType: event.providerEventType,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
          this.debug('Askrift handler threw:', error);
        }
      }
    }

    return {
      verified: true,
      handled: errors.length === 0 && handled,
      eventType: event.eventType,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }
  public debug(msg: any, ...optionalParams: any[]) {
    if (this._debug) console.log(msg, ...optionalParams);
  }

  protected normalizeEventName(eventName: string): string {
    return eventName.trim().toLowerCase();
  }

  private getDispatchNames(event: AskriftParsedEvent): string[] {
    const names = [event.eventType, ...(event.aliases || [])];
    return Array.from(new Set(names.map((eventName) => this.normalizeEventName(eventName))));
  }

  abstract validRequest(): boolean;

  validPayload(): boolean {
    return this.verify();
  }

  abstract verify(): boolean;
  abstract getEventType(): SubscriptionEventType | null;
  abstract toNormalizedEvent(): NormalizedSubscriptionEvent | null;

  parseEvent(): Promise<NormalizedSubscriptionEvent | null> {
    if (!this.verify()) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.toNormalizedEvent());
  }

  protected parseProviderEvent(): AskriftParsedEvent | null {
    throw new Error("parseProviderEvent() must be implemented by a subclass");
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
