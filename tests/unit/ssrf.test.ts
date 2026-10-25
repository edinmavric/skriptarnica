import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { isPublicAddress } from '@/server/net/ip';
import {
  fetchLinkPreview,
  parsePreview,
  UnsafeUrlError,
  validatePublicUrl,
} from '@/server/net/link-preview';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '2001:db8::1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('validatePublicUrl', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com',
    'gopher://example.com',
    'http://localhost/',
    'http://LOCALHOST:80/',
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://metadata.google.internal/',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => validatePublicUrl(url)).toThrow(UnsafeUrlError);
  });

  it('accepts public http(s) URLs', () => {
    expect(validatePublicUrl('https://www.etf.bg.ac.rs/sr/vesti').hostname).toBe(
      'www.etf.bg.ac.rs',
    );
  });
});

describe('fetchLinkPreview', () => {
  it('refuses to connect to a local server even via a hostname that resolves to it', async () => {
    const server = createServer((_req, res) => res.end('<title>secret</title>')).listen(
      0,
      '127.0.0.1',
    );
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    // Non-default port is refused before connecting; default ports resolve to loopback → blocked.
    await expect(fetchLinkPreview(`http://127.0.0.1:${port}/`)).rejects.toThrow(UnsafeUrlError);
    await expect(fetchLinkPreview('http://localtest.me/')).rejects.toThrow();
    server.close();
  });
});

describe('parsePreview', () => {
  it('reads Open Graph tags and resolves relative https images', () => {
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Raspored ispita &amp; rokovi"><meta name="description" content="Januarski rok"><meta property="og:image" content="/slika.png"></head></html>`;
    expect(parsePreview(html, new URL('https://etf.bg.ac.rs/raspored'))).toEqual({
      url: 'https://etf.bg.ac.rs/raspored',
      title: 'Raspored ispita & rokovi',
      description: 'Januarski rok',
      siteName: 'etf.bg.ac.rs',
      imageUrl: 'https://etf.bg.ac.rs/slika.png',
    });
  });
});
