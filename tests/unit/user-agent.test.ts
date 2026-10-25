import { describe, expect, it } from 'vitest';

import { describeUserAgent } from '@/lib/user-agent';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Chrome',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
      'Edge',
      'Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari',
      'iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      'Chrome',
      'Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox', 'Linux'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      'Safari',
      'macOS',
    ],
  ])('%s', (ua, browser, os) => {
    expect(describeUserAgent(ua)).toEqual({ browser, os });
  });
  it('handles missing and unknown agents', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null });
    expect(describeUserAgent('curl/8.0')).toEqual({ browser: null, os: null });
  });
});
