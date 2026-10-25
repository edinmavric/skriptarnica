/**
 * Strict nonce-based Content Security Policy (SPEC §7.1).
 * script-src uses a per-request nonce + 'strict-dynamic'; no inline scripts without the nonce.
 * style-src allows inline style attributes (React `style` props, Radix positioning) — style
 * injection cannot execute code; see docs/DECISIONS.md.
 */
export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Extra origins for images (public storage/CDN). */
  imgOrigins?: string[];
  /** Extra origins for fetch/XHR (direct uploads, Sentry, analytics). */
  connectOrigins?: string[];
  /** Extra origins allowed in frames (Turnstile). */
  frameOrigins?: string[];
}

export function buildCsp({
  nonce,
  isDev,
  imgOrigins = [],
  connectOrigins = [],
  frameOrigins = [],
}: CspOptions): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', ...imgOrigins],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...connectOrigins, ...(isDev ? ['ws:'] : [])],
    'frame-src': [...frameOrigins],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", ...frameOrigins],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`);
  if (!isDev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

export function originOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}
