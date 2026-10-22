import { MINUTE_MS } from '../time';

/** Last accepted action per key, such as `${userId}:${action}`, in epoch milliseconds. */
export const ACTION_COOLDOWNS: Map<string, number> = new Map();

const COOLDOWN_SWEEP_INTERVAL_MS = MINUTE_MS;
const COOLDOWN_MAX_AGE_MS = MINUTE_MS;

// Stale entries are swept so distinct keys cannot grow the map without bound.
setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MAX_AGE_MS;
  for (const [key, timestamp] of ACTION_COOLDOWNS) {
    if (timestamp < cutoff) ACTION_COOLDOWNS.delete(key);
  }
}, COOLDOWN_SWEEP_INTERVAL_MS).unref();

/** Records the action and returns true, or returns false while the key is cooling down. */
export function checkRateLimit(key: string, limitMs: number = 500): boolean {
  const now = Date.now();
  const lastAction = ACTION_COOLDOWNS.get(key);

  if (lastAction !== undefined && now - lastAction < limitMs) return false;

  ACTION_COOLDOWNS.set(key, now);
  return true;
}
