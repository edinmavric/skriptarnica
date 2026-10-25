import { createHmac, timingSafeEqual } from 'node:crypto';

/** "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>" (Stripe-style). */
export function signPayload(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verifySignature(
  secret: string,
  body: string,
  header: string | null,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=') as [string, string]),
  );
  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!Number.isInteger(timestamp) || !provided || !/^[0-9a-f]{64}$/.test(provided)) return false;
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(provided, 'hex'));
}
