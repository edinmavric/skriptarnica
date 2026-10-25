import { isIP } from 'node:net';

/**
 * Address classification for SSRF protection (SPEC §4.7). Anything that isn't a public
 * unicast address is blocked: loopback, private, link-local (incl. cloud metadata
 * 169.254.169.254), CGNAT, multicast, reserved, documentation, and IPv4-mapped IPv6 forms.
 */
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function expandV6(ip: string): number[] | null {
  let address = ip.toLowerCase().split('%')[0] ?? '';
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (v4?.[1]) {
    const n = ipv4ToInt(v4[1]);
    address = address.replace(v4[1], `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const [head = '', tail] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : [];
  if (tail === undefined && headParts.length !== 8) return null;
  const missing = 8 - headParts.length - tailParts.length;
  const parts = [
    ...headParts,
    ...Array.from({ length: tail === undefined ? 0 : missing }, () => '0'),
    ...tailParts,
  ];
  if (parts.length !== 8) return null;
  return parts.map((part) => parseInt(part || '0', 16));
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return !BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  if (version === 6) {
    const words = expandV6(ip);
    if (!words) return false;
    const [w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0, w6 = 0, w7 = 0] = words;
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compat) → judge the embedded IPv4 address.
    if (
      w0 === 0 &&
      w1 === 0 &&
      w2 === 0 &&
      w3 === 0 &&
      w4 === 0 &&
      (w5 === 0xffff || w5 === 0) &&
      (w6 !== 0 || w7 > 1)
    ) {
      return isPublicAddress(`${w6 >> 8}.${w6 & 0xff}.${w7 >> 8}.${w7 & 0xff}`);
    }
    if (words.every((w) => w === 0)) return false; // ::
    if (words.slice(0, 7).every((w) => w === 0) && w7 === 1) return false; // ::1
    if ((w0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((w0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((w0 & 0xff00) === 0xff00) return false; // multicast
    if (w0 === 0x2001 && w1 === 0x0db8) return false; // documentation
    if (w0 === 0x64 && w1 === 0xff9b) return false; // NAT64
    return true;
  }
  return false;
}
