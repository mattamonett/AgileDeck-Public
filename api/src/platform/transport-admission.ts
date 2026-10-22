import { MINUTE_MS } from './time';
import {
  recordRateLimitHit,
  recordCookieRateLimitHit,
} from '../modules/telemetry/rate-limit-telemetry';
import type { IncomingMessage } from 'node:http';
import cookie from 'cookie';
import { ipKeyGenerator } from 'express-rate-limit';
import { getClientIp } from './http/client-ip';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from './http/visitor-session';
import { WindowBudget } from './concurrency/window-budget';

const ATTEMPTS_PER_NETWORK_PER_MINUTE = 120;
const ATTEMPTS_PER_VISITOR_PER_MINUTE = 30;
const ATTEMPTS_PER_MINUTE = 1000;
const MAX_TRANSPORTS = 2000;
const MAX_TRANSPORTS_PER_VISITOR = 5;
const MAX_TRANSPORTS_PER_NETWORK = 100;
/** A reservation whose handshake never completes is released after this long. */
const HANDSHAKE_TIMEOUT_MS = 10_000;

export class TransportAdmission {
  private readonly attempts = new WindowBudget(ATTEMPTS_PER_NETWORK_PER_MINUTE, MINUTE_MS);
  private readonly globalAttempts = new WindowBudget(ATTEMPTS_PER_MINUTE, MINUTE_MS, 1);
  private readonly visitorAttempts = new WindowBudget(ATTEMPTS_PER_VISITOR_PER_MINUTE, MINUTE_MS);
  private readonly visitors = new Map<string, number>();
  private readonly networks = new Map<string, number>();
  private readonly reservations = new WeakMap<IncomingMessage, () => () => void>();
  private active = 0;

  /** hasAccess applies the site password before any transport is allocated. */
  constructor(
    private readonly hasAccess: (req: IncomingMessage, visitorId: string) => boolean = () => true,
  ) {}

  admit(req: IncomingMessage): string | null {
    const network = ipKeyGenerator(
      getClientIp(req.socket?.remoteAddress ?? 'unknown', req.headers),
    );
    if (!this.attempts.consume(network)) {
      recordCookieRateLimitHit(req.headers.cookie);
      return 'Too many connection attempts';
    }
    let visitor: string | null;
    try {
      visitor = decodeVisitorCookie(
        cookie.parse(req.headers.cookie ?? '')[VISITOR_COOKIE_NAME],
      ).visitorId;
    } catch {
      return 'Invalid session';
    }
    if (!visitor) return 'A valid session is required';
    if (!this.visitorAttempts.consume(visitor)) {
      recordRateLimitHit(visitor);
      return 'Too many connection attempts';
    }
    if (!this.hasAccess(req, visitor)) return 'The site password is required';
    if (
      this.active >= MAX_TRANSPORTS ||
      (this.visitors.get(visitor) ?? 0) >= MAX_TRANSPORTS_PER_VISITOR ||
      (this.networks.get(network) ?? 0) >= MAX_TRANSPORTS_PER_NETWORK
    ) {
      recordRateLimitHit(visitor);
      return 'Connection capacity reached';
    }
    // Rejected requests must not exhaust admission for unrelated networks.
    if (!this.globalAttempts.consume('all')) {
      recordRateLimitHit(visitor);
      return 'Too many connection attempts';
    }
    this.active++;
    this.visitors.set(visitor, (this.visitors.get(visitor) ?? 0) + 1);
    this.networks.set(network, (this.networks.get(network) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(expiry);
      this.active--;
      for (const [store, key] of [
        [this.visitors, visitor],
        [this.networks, network],
      ] as const) {
        const count = (store.get(key) ?? 1) - 1;
        if (count === 0) store.delete(key);
        else store.set(key, count);
      }
    };
    // Failed handshakes never emit connection; reclaim their reservations.
    const expiry = setTimeout(() => {
      this.reservations.delete(req);
      release();
    }, HANDSHAKE_TIMEOUT_MS);
    expiry.unref();
    this.reservations.set(req, () => {
      clearTimeout(expiry);
      return release;
    });
    return null;
  }

  connected(req: IncomingMessage, onClose: (release: () => void) => void): boolean {
    const claim = this.reservations.get(req);
    if (!claim) return false;
    this.reservations.delete(req);
    const release = claim();
    // The reservation is claimed for the entire transport lifetime.
    onClose(release);
    return true;
  }
}
