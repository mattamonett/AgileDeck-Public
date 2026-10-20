import { persistThrowStatsBatch, type ThrowStatsEntry } from './room-stats.repository';
import { logger } from '../../platform/logger';

const FLUSH_INTERVAL_MS = 10_000;
const MAX_PENDING = 2000;
const MAX_BATCH = 200;

export interface AcceptedThrow {
  readonly roomId: string;
  readonly visitorId: string;
  readonly targetVisitorId: string;
  readonly kind: 'throw' | 'barrage';
  readonly character: string;
}

/**
 * Collects room throw counters in memory and writes them in bounded batches, so
 * a throw adds no database write. Counts lag by up to one flush interval and are
 * lost if the process crashes; a graceful stop drains them.
 */
export class ThrowStatsRecorder {
  private readonly pending = new Map<string, ThrowStatsEntry>();
  private flushing = false;
  private idle: Promise<void> = Promise.resolve();
  constructor(private readonly persist = persistThrowStatsBatch) {}

  record({ roomId, visitorId, targetVisitorId, kind, character }: AcceptedThrow): void {
    this.add({
      roomId,
      visitorId,
      sent: 1,
      received: 0,
      barrages: kind === 'barrage' ? 1 : 0,
      characters: [character],
    });
    this.add({
      roomId,
      visitorId: targetVisitorId,
      sent: 0,
      received: 1,
      barrages: 0,
      characters: [],
    });
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    const idle = Promise.withResolvers<void>();
    this.idle = idle.promise;
    const batch: ThrowStatsEntry[] = [];
    for (const [key, entry] of this.pending) {
      if (batch.length === MAX_BATCH) break;
      this.pending.delete(key);
      batch.push(entry);
    }
    try {
      if (batch.length > 0) await this.persist(batch);
    } catch (error) {
      for (const entry of batch) this.add(entry);
      throw error;
    } finally {
      this.flushing = false;
      idle.resolve();
    }
  }

  /** Drops buffered counts for deleted data, after any flush already writing them. */
  async forget(matches: (entry: ThrowStatsEntry) => boolean): Promise<void> {
    await this.idle;
    for (const [key, entry] of this.pending) if (matches(entry)) this.pending.delete(key);
  }

  /** Writes everything buffered; each pass shrinks the buffer or throws. */
  async drain(): Promise<void> {
    while (this.pending.size > 0 && !this.flushing) await this.flush();
  }

  private add(entry: ThrowStatsEntry): void {
    const key = entry.roomId + '|' + entry.visitorId;
    const current = this.pending.get(key);
    if (current) {
      this.pending.set(key, {
        ...current,
        sent: current.sent + entry.sent,
        received: current.received + entry.received,
        barrages: current.barrages + entry.barrages,
        characters: [...new Set([...current.characters, ...entry.characters])],
      });
    } else if (this.pending.size < MAX_PENDING) {
      this.pending.set(key, entry);
    }
  }
}

export const throwStats = new ThrowStatsRecorder();

export function startThrowStats(): void {
  const timer = setInterval(() => {
    void throwStats
      .flush()
      .catch(() => logger.error('Throw statistics flush failed; buffered counts will be retried.'));
  }, FLUSH_INTERVAL_MS);
  timer.unref();
}
