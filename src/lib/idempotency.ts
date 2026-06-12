import { isObject } from "./utils";

export type WebhookProvider = 'paddle';

export type EventTimestampValidationOptions = {
  /** Maximum accepted event age in milliseconds. */
  maxAgeMs: number;
  /**
   * Allowed clock skew in milliseconds, applied to both directions.
   * Permits a small tolerance for events arriving slightly in the future
   * (or stale events whose timestamps trail the receiver clock).
   * Defaults to 5 minutes.
   */
  toleranceMs?: number;
  /** Time to compare against. Defaults to the current time. */
  now?: Date | number;
};

export interface NormalizedWebhookEvent {
  getIdempotencyKey(): string | null;
  getEventTimestamp(): Date | null;
  isFresh(options: EventTimestampValidationOptions): boolean;
}

type ProviderConfig = {
  idFields: string[];
  timestampFields: string[];
};

const PROVIDER_CONFIG: Record<WebhookProvider, ProviderConfig> = {
  paddle: {
    idFields: ['alert_id'],
    timestampFields: ['event_time'],
  },
};

function asPayload(payload: unknown): Record<string, any> | null {
  return isObject(payload) && !Array.isArray(payload) ? payload as Record<string, any> : null;
}

function parsePaddleTimestamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || value.trim() === '') return null;

  // Paddle Classic sends timestamps like "2021-09-10 10:36:39" in UTC.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function coerceNow(now: Date | number | undefined): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return now;
  return Date.now();
}

export function extractStableEventId(provider: WebhookProvider, payload: unknown): string | null {
  const parsedPayload = asPayload(payload);
  if (!parsedPayload) return null;

  for (const field of PROVIDER_CONFIG[provider].idFields) {
    const value = parsedPayload[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return null;
}

export function extractEventTimestamp(provider: WebhookProvider, payload: unknown): Date | null {
  const parsedPayload = asPayload(payload);
  if (!parsedPayload) return null;

  for (const field of PROVIDER_CONFIG[provider].timestampFields) {
    const value = parsedPayload[field];
    const timestamp = provider === 'paddle' ? parsePaddleTimestamp(value) : null;
    if (timestamp) return timestamp;
  }

  return null;
}

export function isEventFresh(
  provider: WebhookProvider,
  payload: unknown,
  options: EventTimestampValidationOptions,
): boolean {
  if (options.maxAgeMs < 0) return false;

  const toleranceMs = options.toleranceMs ?? 5 * 60 * 1000;
  if (toleranceMs < 0) throw new Error("toleranceMs must be non-negative");

  const timestamp = extractEventTimestamp(provider, payload);
  if (!timestamp) return false;

  const ageMs = coerceNow(options.now) - timestamp.getTime();
  return ageMs >= -toleranceMs && ageMs <= options.maxAgeMs + toleranceMs;
}

export function normalizeWebhookEvent<T extends Record<string, any>>(
  provider: WebhookProvider,
  payload: T,
): T & NormalizedWebhookEvent {
  const target: Record<string, any> = Object.isExtensible(payload) ? payload : { ...payload };

  Object.defineProperties(target, {
    getIdempotencyKey: {
      configurable: true,
      enumerable: false,
      value: () => {
        const eventId = extractStableEventId(provider, target);
        return eventId ? `${provider}:${eventId}` : null;
      },
    },
    getEventTimestamp: {
      configurable: true,
      enumerable: false,
      value: () => extractEventTimestamp(provider, target),
    },
    isFresh: {
      configurable: true,
      enumerable: false,
      value: (options: EventTimestampValidationOptions) => isEventFresh(provider, target, options),
    },
  });

  return target as T & NormalizedWebhookEvent;
}
