import {
  isDeletionContextValid,
  isVisitorDeleting,
} from '../../platform/concurrency/deletion-context';
import cookie from 'cookie';
import type { RequestHandler } from 'express';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../platform/http/visitor-session';
import {
  persistRateLimitBatch,
  rateLimitCutoff,
  type RateLimitBatchEntry,
} from './rate-limit-stats.repository';
import { logger } from '../../platform/logger';

/** Counts are stored as 32-bit integers, so they saturate instead of overflowing. */
const MAX_COUNT = 2_147_483_647;
const MAX_VISITOR_ID_LENGTH = 128;
const MAX_COOKIE_LENGTH = 8192;
/** Visitor-days buffered between flushes; further new visitors are dropped. */
const MAX_PENDING = 2000;
const FLUSH_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 10_000;

/** Observability only: bounded buffering never delays or changes admission decisions. */
export class RateLimitRecorder {
  private readonly pending = new Map<string, RateLimitBatchEntry>();
  private flushing = false;
  private idle = Promise.resolve();
  constructor(private readonly persist = persistRateLimitBatch) {}

  record(visitorId: string | null | undefined, now = new Date()): void {
    if (
      !visitorId ||
      visitorId.length > MAX_VISITOR_ID_LENGTH ||
      !isDeletionContextValid() ||
      isVisitorDeleting(visitorId)
    )
      return;
    const day = now.toISOString().slice(0, 10);
    const key = day + ':' + visitorId;
    const entry = this.pending.get(key);
    if (entry) {
      entry.count = Math.min(MAX_COUNT, entry.count + 1);
      entry.lastHitAt = now;
    } else if (this.pending.size < MAX_PENDING) {
      this.pending.set(key, { visitorId, day, count: 1, lastHitAt: now });
    }
  }

  async forget(visitorId: string): Promise<void> {
    await this.idle;
    for (const [key, entry] of this.pending)
      if (entry.visitorId === visitorId) this.pending.delete(key);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    const idle = Promise.withResolvers<void>();
    this.idle = idle.promise;
    const batch: RateLimitBatchEntry[] = [];
    const cutoff = rateLimitCutoff();
    for (const [key, entry] of this.pending) {
      if (entry.day < cutoff) {
        this.pending.delete(key);
        continue;
      }
      if (batch.length === FLUSH_BATCH_SIZE) break;
      this.pending.delete(key);
      batch.push(entry);
    }
    try {
      await this.persist(batch);
    } catch (error) {
      for (const entry of batch) {
        const key = entry.day + ':' + entry.visitorId;
        const current = this.pending.get(key);
        if (current) current.count = Math.min(MAX_COUNT, current.count + entry.count);
        else if (this.pending.size < MAX_PENDING) this.pending.set(key, entry);
      }
      throw error;
    } finally {
      this.flushing = false;
      idle.resolve();
    }
  }
}

export const rateLimitRecorder = new RateLimitRecorder();
export const recordRateLimitHit = (visitorId: string | null | undefined): void =>
  rateLimitRecorder.record(visitorId);

export function recordCookieRateLimitHit(rawCookie: string | undefined): void {
  if (!rawCookie || rawCookie.length > MAX_COOKIE_LENGTH) return;
  try {
    recordRateLimitHit(decodeVisitorCookie(cookie.parse(rawCookie)[VISITOR_COOKIE_NAME]).visitorId);
  } catch {
    /* Invalid or unauthenticated traffic cannot be attributed to a member. */
  }
}

export const observeHttpRateLimits: RequestHandler = (req, res, next) => {
  res.once('finish', () => {
    if (res.statusCode === 429) recordCookieRateLimitHit(req.headers.cookie);
  });
  next();
};

export function startRateLimitTelemetry(): void {
  const timer = setInterval(() => {
    void rateLimitRecorder
      .flush()
      .catch(() =>
        logger.error('Rate-limit statistics flush failed; buffered counts will be retried.'),
      );
  }, FLUSH_INTERVAL_MS);
  timer.unref();
}
