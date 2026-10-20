/** Bounded, expiring request counters for work that must not reach the database. */
export class WindowBudget {
  private readonly entries = new Map<string, { count: number; expires: number }>();
  private nextSweep = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  consume(key: string): boolean {
    const now = Date.now();
    if (now >= this.nextSweep) this.sweep(now);
    const current = this.entries.get(key);
    if (current && current.expires > now) {
      if (current.count >= this.limit) return false;
      current.count++;
      return true;
    }
    // Re-insert so iteration order stays oldest-window first.
    this.entries.delete(key);
    if (this.entries.size >= this.maxKeys) this.evictOldest();
    this.entries.set(key, { count: 1, expires: now + this.windowMs });
    return true;
  }

  /** Drops every counter whose key matches, e.g. when its owner is deleted. */
  forget(matches: (key: string) => boolean): void {
    for (const key of this.entries.keys()) if (matches(key)) this.entries.delete(key);
  }

  private sweep(now: number): void {
    for (const [entryKey, entry] of this.entries)
      if (entry.expires <= now) this.entries.delete(entryKey);
    this.nextSweep = now + Math.min(this.windowMs, 60_000);
  }

  /**
   * A full table must not refuse every new key, or flooding it with distinct keys
   * would deny all legitimate callers. Forgetting the oldest window only resets
   * that key's count; callers keep separate global limits for aggregate cost.
   */
  private evictOldest(): void {
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }
}
