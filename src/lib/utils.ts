import * as crypto from 'crypto';

export function isObject(obj: any) {
  return obj !== undefined && obj !== null && typeof obj == 'object';
}

export function getHeader(headers: Record<string, any> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  const value = found ? headers[found] : undefined;
  if (Array.isArray(value)) return value[0];
  return value === undefined ? undefined : String(value);
}

export function getRawBody(req: any): string {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body || {});
}

export function parseBody<T>(req: any): T {
  if (isObject(req.body) && !Buffer.isBuffer(req.body)) return req.body as T;
  const rawBody = getRawBody(req);
  const contentType = getHeader(req.headers, 'content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const parsed: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((value, key) => { parsed[key] = value; });
    return parsed as unknown as T;
  }
  return JSON.parse(rawBody) as T;
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function hmacSha256Base64(secret: string | Buffer, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

export function timingSafeEqualString(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isPostJsonOrForm(req: any): boolean {
  const contentType = getHeader(req.headers, 'content-type') || '';
  return req.method === 'POST' && (
    contentType.includes('application/json') ||
    contentType.includes('application/x-www-form-urlencoded')
  );
}
