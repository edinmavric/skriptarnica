import { createHash } from 'node:crypto';

import { headers } from 'next/headers';

import { env } from '@/env';

/** Client IP from trusted proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
}

/** Salted SHA-256 of an IP; raw IPs are never stored (SPEC §7.2). */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${env.IP_HASH_SALT}:${ip}`).digest('hex');
}

export async function clientIpHash(): Promise<string> {
  return hashIp(await clientIp());
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

export async function requestId(): Promise<string | null> {
  return (await headers()).get('x-request-id');
}
