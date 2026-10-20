import type { ThrowOverheat } from '@poker/shared';

/** Rejected throws within this window count toward overheating. */
const REJECTION_WINDOW_MS = 5000;
const REJECTIONS_BEFORE_OVERHEAT = 20;
/** Overheat lasts longer on each strike: 5 s, then 15 s, then a minute. */
const MAX_OVERHEAT_MS = 60_000;
const OVERHEAT_MS = [5000, 15_000, MAX_OVERHEAT_MS] as const;
const MAX_STRIKES = 3;
const SWEEP_INTERVAL_MS = 60_000;

interface ThrowHistory {
  rejectedAt: number[];
  strikes: number;
  lastPenaltyAt: number;
  overheat: ThrowOverheat;
}

const histories = new Map<string, ThrowHistory>();
const RESET_MS = 120_000;

export function getThrowOverheat(userId: string): ThrowOverheat | undefined {
  const overheat = histories.get(userId)?.overheat;
  return overheat && overheat.until > Date.now() ? overheat : undefined;
}

/** Called only for rate-limited throws. Requests during a penalty do nothing. */
export function recordRejectedThrow(userId: string): boolean {
  const now = Date.now();
  let history = histories.get(userId);
  if (history && history.overheat.until > now) return false;
  if (!history) {
    history = {
      rejectedAt: [],
      strikes: 0,
      lastPenaltyAt: now,
      overheat: { startedAt: 0, until: 0 },
    };
    histories.set(userId, history);
  }
  if (now - history.lastPenaltyAt >= RESET_MS) history.strikes = 0;
  history.rejectedAt = history.rejectedAt.filter((at) => now - at < REJECTION_WINDOW_MS);
  history.rejectedAt.push(now);
  if (history.rejectedAt.length < REJECTIONS_BEFORE_OVERHEAT) return false;

  const duration =
    OVERHEAT_MS[Math.min(history.strikes, OVERHEAT_MS.length - 1)] ?? MAX_OVERHEAT_MS;
  history.strikes = Math.min(history.strikes + 1, MAX_STRIKES);
  history.lastPenaltyAt = now;
  history.rejectedAt = [];
  history.overheat = { startedAt: now, until: now + duration };
  return true;
}

export function clearThrowPenalties(): void {
  histories.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, history] of histories) {
    if (
      now - history.lastPenaltyAt >= RESET_MS &&
      history.rejectedAt.every((at) => now - at >= REJECTION_WINDOW_MS)
    ) {
      histories.delete(userId);
    }
  }
}, SWEEP_INTERVAL_MS).unref();

export function clearUserThrowPenalty(userId: string): void {
  histories.delete(userId);
}
