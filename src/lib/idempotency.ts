import { isObject } from "./utils";

export type WebhookProvider = 'paddle' | 'stripe' | 'gumroad' | 'lemon-squeezy' | 'polar';

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
  isFresh(options: EventTimestampValidationOptions): boolean | null;
}

type ProviderConfig = {
  idFields: string[];
  timestampFields: string[];
  parseTimestamp?: (value: unknown) => Date | null;
};

const PROVIDER_CONFIG: Record<WebhookProvider, ProviderConfig> = {
  paddle: {
    idFields: ['alert_id'],
    timestampFields: ['event_time'],
    parseTimestamp: parsePaddleTimestamp,
  },
  stripe: {
    idFields: ['id'],
    timestampFields: ['created'],
    parseTimestamp: parseUnixSecondsTimestamp,
  },
  gumroad: {
    idFields: ['id'],
    timestampFields: ['created_at'],
  },
  'lemon-squeezy': {
    idFields: ['meta', 'event_id'],
    timestampFields: ['meta', 'created_at'],
  },
  polar: {
    idFields: ['id'],
    timestampFields: ['timestamp'],
  },
  stripe: {
    idFields: ['id'],
    timestampFields: ['created'],
  },
  gumroad: {
    idFields: ['sale_id'],
    timestampFields: ['sale_timestamp'],
  },
  'lemon-squeezy': {
    idFields: ['meta', 'event_id'],
    timestampFields: ['meta', 'created_at'],
  },
  polar: {
    idFields: ['data', 'id'],
    timestampFields: ['data', 'modified_at'],
  },
};

function asPayload(payload: unknown): Record<string, any> | null {
  return isObject(payload) && !Array.isArray(payload) ? payload as Record<string, any> : null;
}

function resolvePath(target: unknown, path: string | string[]): unknown {
  const segments = Array.isArray(path) ? path : [path];
  let current: unknown = target;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, any>)[segment];
  }
  return current;
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

function parseUnixSecondsTimestamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const date = new Date(numeric * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
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
    const value = resolvePath(parsedPayload, field);
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return null;
}

export function extractEventTimestamp(provider: WebhookProvider, payload: unknown): Date | null {
  const parsedPayload = asPayload(payload);
  if (!parsedPayload) return null;

  for (const field of PROVIDER_CONFIG[provider].timestampFields) {
    const value = resolvePath(parsedPayload, field);
    const customParser = PROVIDER_CONFIG[provider].parseTimestamp;
    let timestamp: Date | null = null;
    if (customParser) {
      timestamp = customParser(value);
    } else if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      timestamp = Number.isNaN(date.getTime()) ? null : date;
    }
    if (timestamp) return timestamp;
  }

  return null;
}

export function isEventFresh(
  provider: WebhookProvider,
  payload: unknown,
  options: EventTimestampValidationOptions,
): boolean | null {
  if (options.maxAgeMs < 0) throw new Error("maxAgeMs must be non-negative");

  const toleranceMs = options.toleranceMs ?? 5 * 60 * 1000;
  if (toleranceMs < 0) throw new Error("toleranceMs must be non-negative");

  const timestamp = extractEventTimestamp(provider, payload);
  if (!timestamp) return null;

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
