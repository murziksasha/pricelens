import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class BlockedUrlError extends Error {
  readonly code = 'blocked_url';
  constructor(readonly url: string) {
    super('blocked_url');
  }
}

const BLOCKED_HOSTS = new Set(['localhost', 'postgres', 'api', 'web', 'worker', 'host.docker.internal', 'metadata.google.internal']);

function ipv4ToInt(ip: string) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

// 198.18.0.0/15 is deliberately allowed: VPN/proxy clients in fake-IP DNS mode (Clash, sing-box, …)
// resolve every public host into it, and blocking it would block every marketplace.
const V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3],
];

/** True for loopback, private, link-local, CGNAT, multicast/reserved and unspecified addresses. */
export function isNonPublicAddress(address: string): boolean {
  let ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];
  const version = isIP(ip);
  if (version === 4) {
    const value = ipv4ToInt(ip);
    return V4_RANGES.some(([base, bits]) => (value >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
    if (/^ff/.test(ip)) return true; // multicast
    if (/^::ffff:/.test(ip)) return true; // other mapped forms
    return false;
  }
  return true;
}

export type HostLookup = (host: string) => Promise<string[]>;

const defaultLookup: HostLookup = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

/**
 * Throws BlockedUrlError unless `url` is http(s) and its host resolves only to public addresses.
 * Used for user-supplied URLs (constructor preview, screenshots) and every fetch hop (SSRF guard).
 */
export async function assertPublicHttpUrl(url: string, resolve: HostLookup = defaultLookup): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedUrlError(url);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new BlockedUrlError(url);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new BlockedUrlError(url);
  }
  if (isIP(host)) {
    if (isNonPublicAddress(host)) throw new BlockedUrlError(url);
    return parsed;
  }
  // Single-label names are Docker services or LAN hosts, never marketplaces.
  if (!host.includes('.')) throw new BlockedUrlError(url);
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new BlockedUrlError(url);
  }
  if (!addresses.length || addresses.some(isNonPublicAddress)) throw new BlockedUrlError(url);
  return parsed;
}
