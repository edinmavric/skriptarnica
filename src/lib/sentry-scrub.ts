import type { ErrorEvent, init } from '@sentry/nextjs';

type DataCollection = NonNullable<Parameters<typeof init>[0]['dataCollection']>;

/** Collect no PII by default (SPEC §7.2). Replaces the pre-v11 `sendDefaultPii: false`. */
export const sentryDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
};

/** Removes PII (emails, IP addresses, cookies, auth headers) before an event leaves the process (SPEC §7.2). */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SENSITIVE_HEADERS = ['cookie', 'authorization', 'x-forwarded-for', 'x-real-ip'];

export function scrubText(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(IPV4_RE, '[ip]');
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          delete event.request.headers[header];
        }
      }
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubText(event.request.query_string);
    }
  }
  if (event.message) {
    event.message = scrubText(event.message);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubText(exception.value);
    }
  }
  return event;
}
