import { persistUsageBatch, usageDay, type UsageBatchEntry } from './usage-stats.repository';
import { getSiteConfig } from '../../config/site-config';
import { throwableUsageKey, type UsageKey, type UsageMetric } from '@poker/shared';
import { logger } from '../../platform/logger';

/** Counts are stored as 32-bit integers, so they saturate instead of overflowing. */
const MAX_COUNT = 2_147_483_647;
const FLUSH_INTERVAL_MS = 10_000;

const MAX_PENDING = 2000;
const MAX_BATCH = 200;

/**
 * Observability only: counts accepted actions in memory and writes them in
 * bounded batches, so recording never adds a database write to the action path.
 */
export class UsageRecorder {
  private readonly pending = new Map<string, UsageBatchEntry>();
  private flushing = false;
  constructor(private readonly persist = persistUsageBatch) {}

  /** Does nothing while the operator has usage stats turned off. */
  record(metric: UsageKey, now = new Date()): void {
    if (!getSiteConfig().features.usageStats) return;
    this.add({ day: usageDay(now), metric, count: 1 });
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    const batch: UsageBatchEntry[] = [];
    for (const [key, entry] of this.pending) {
      if (batch.length === MAX_BATCH) break;
      this.pending.delete(key);
      batch.push(entry);
    }
    try {
      await this.persist(batch);
    } catch (error) {
      for (const entry of batch) this.add(entry);
      throw error;
    } finally {
      this.flushing = false;
    }
  }

  private add(entry: UsageBatchEntry): void {
    const key = entry.day + '|' + entry.metric;
    const current = this.pending.get(key);
    if (current) current.count = Math.min(MAX_COUNT, current.count + entry.count);
    else if (this.pending.size < MAX_PENDING) this.pending.set(key, { ...entry });
  }
}

export const usageRecorder = new UsageRecorder();

export const recordUsage = (metric: UsageMetric): void => usageRecorder.record(metric);

export function recordThrowableUsage(character: string): void {
  const key = throwableUsageKey(character);
  if (key) usageRecorder.record(key);
}

export function startUsageTelemetry(): void {
  const timer = setInterval(() => {
    void usageRecorder
      .flush()
      .catch(() => logger.error('Usage statistics flush failed; buffered counts will be retried.'));
  }, FLUSH_INTERVAL_MS);
  timer.unref();
}
