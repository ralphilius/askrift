export type RequestHeaders = Record<string, string | string[] | undefined>;

export type InternalRequest = {
  method: string;
  headers: RequestHeaders;
  body: unknown;
  rawBody?: Buffer | string;
};

type HeaderValue = string | number | string[] | undefined;

type RawRequestInput = {
  method: string;
  headers?: Record<string, HeaderValue>;
  body?: unknown;
  rawBody?: Buffer | string;
};

type FrameworkRequest = {
  method?: string;
  headers?: Record<string, HeaderValue>;
  body?: unknown;
  rawBody?: Buffer | string;
};

function normalizeHeaders(headers: Record<string, HeaderValue> = {}): RequestHeaders {
  return Object.entries(headers).reduce<RequestHeaders>((normalized, [key, value]) => {
    const normalizedKey = key.toLowerCase();

    if (Array.isArray(value)) {
      normalized[normalizedKey] = value.map(String);
    } else if (value === undefined) {
      normalized[normalizedKey] = undefined;
    } else {
      normalized[normalizedKey] = String(value);
    }

    return normalized;
  }, {});
}

export function fromRaw({ method, headers = {}, body, rawBody }: RawRequestInput): InternalRequest {
  return {
    method,
    headers: normalizeHeaders(headers),
    body,
    rawBody,
  };
}

export function fromExpress(req: FrameworkRequest): InternalRequest {
  return fromRaw({
    method: req.method || '',
    headers: req.headers,
    body: req.body,
    rawBody: req.rawBody,
  });
}

export function fromVercel(req: FrameworkRequest): InternalRequest {
  return fromRaw({
    method: req.method || '',
    headers: req.headers,
    body: req.body,
    rawBody: req.rawBody,
  });
}
