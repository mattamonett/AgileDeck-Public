import { BlockList, isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import { ipKeyGenerator } from 'express-rate-limit';

function normalizeIp(value: string): string {
  return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
}

/**
 * TRUSTED_PROXY_IPS lists the reverse proxies (addresses or CIDR ranges) allowed
 * to report the client address. Read on each call so tests and restarts agree.
 */
function trustedProxies(): BlockList {
  const list = new BlockList();
  for (const entry of (process.env.TRUSTED_PROXY_IPS ?? '').split(',')) {
    const value = entry.trim();
    if (!value) continue;
    const [address = '', prefix] = value.split('/');
    const family = isIP(normalizeIp(address));
    if (family === 0) continue;
    const type = family === 4 ? 'ipv4' : 'ipv6';
    const bits = prefix === undefined ? undefined : Number(prefix);
    if (bits === undefined) {
      list.addAddress(normalizeIp(address), type);
    } else if (Number.isInteger(bits) && bits >= 0 && bits <= (family === 4 ? 32 : 128)) {
      list.addSubnet(normalizeIp(address), bits, type);
    }
  }
  return list;
}

function isTrusted(list: BlockList, address: string): boolean {
  const family = isIP(address);
  return family !== 0 && list.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * The client address for rate limits and abuse budgets. X-Forwarded-For is
 * only read when the direct peer is a trusted proxy, and then from the right:
 * each trusted hop is skipped, and the first untrusted address is the client.
 * Entries further left were written by the caller and are never believed.
 */
export function getClientIp(peer: string, headers: IncomingHttpHeaders): string {
  const address = normalizeIp(peer);
  const trusted = trustedProxies();
  if (!isTrusted(trusted, address)) return address;
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded !== 'string') return address;
  const hops = forwarded.split(',').map((hop) => normalizeIp(hop.trim()));
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index] ?? '';
    if (!isIP(hop)) return address;
    if (!isTrusted(trusted, hop)) return hop;
  }
  return address;
}

export function httpClientKey(req: {
  socket?: { remoteAddress?: string | undefined };
  ip?: string | undefined;
  headers: IncomingHttpHeaders;
}): string {
  return ipKeyGenerator(
    getClientIp(req.socket?.remoteAddress || req.ip || '127.0.0.1', req.headers),
  );
}
