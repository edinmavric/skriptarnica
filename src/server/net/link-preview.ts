import { lookup as dnsLookup, type LookupAddress } from 'node:dns';

import { Agent, fetch as undiciFetch } from 'undici';

import type { LinkPreview } from '../db/schema';

import { isPublicAddress } from './ip';

/**
 * Server-side Open Graph preview for link posts with SSRF protection (SPEC §4.7):
 * http/https on default ports only, no credentials in URLs, every resolved address must be
 * public — checked at connect time (defeats DNS rebinding), redirects re-validated (max 3),
 * 5 s timeout, 512 KB cap, HTML only.
 */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function validatePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('invalid url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('protocol not allowed');
  if (url.username || url.password) throw new UnsafeUrlError('credentials not allowed');
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new UnsafeUrlError('port not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new UnsafeUrlError('host not allowed');
  }
  // Literal IPs are checked here; names are checked when they resolve (at connect time).
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError('address not allowed');
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** DNS lookup that refuses non-public answers, used by the HTTP connector itself. */
function safeLookup(hostname: string, options: object, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
      return callback(
        Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }) as NodeJS.ErrnoException,
        '',
        0,
      );
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    const first = list[0] as LookupAddress;
    return callback(null, first.address, first.family);
  });
}

const agent = new Agent({
  connect: { lookup: safeLookup as never, timeout: TIMEOUT_MS },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

async function readLimited(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(
    Buffer.concat(chunks).subarray(0, MAX_BYTES),
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i').exec(html)?.[0];
    const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
    if (content) return decodeEntities(content).slice(0, 300);
  }
  return null;
}

export function parsePreview(html: string, url: URL): LinkPreview {
  const titleTag = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1];
  const title =
    meta(html, ['og:title', 'twitter:title']) ?? (titleTag ? decodeEntities(titleTag) : null);
  const image = meta(html, ['og:image', 'twitter:image']);
  let imageUrl: string | null = null;
  if (image) {
    try {
      const resolved = new URL(image, url);
      // Only https images are shown, and they are never fetched server-side.
      imageUrl = resolved.protocol === 'https:' ? resolved.toString() : null;
    } catch {
      imageUrl = null;
    }
  }
  return {
    url: url.toString(),
    title,
    description: meta(html, ['og:description', 'description', 'twitter:description']),
    siteName: meta(html, ['og:site_name']) ?? url.hostname,
    imageUrl,
  };
}

export async function fetchLinkPreview(raw: string): Promise<LinkPreview> {
  let url = validatePublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await undiciFetch(url, {
      dispatcher: agent,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'SkriptaLinkPreview/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) break;
      url = validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('html')) {
      await response.body?.cancel();
      return {
        url: url.toString(),
        title: null,
        description: null,
        siteName: url.hostname,
        imageUrl: null,
      };
    }
    return parsePreview(await readLimited(response.body as ReadableStream<Uint8Array> | null), url);
  }
  throw new UnsafeUrlError('too many redirects');
}
