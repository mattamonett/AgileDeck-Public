/** Rooms with a reveal countdown reserved or running, so a second one cannot start. */
export const pendingReveals: Set<string> = new Set();

/**
 * Running countdown timers, so a reset can cancel them and a reconnecting
 * client can be told how much of the countdown remains.
 */
export const pendingRevealTimers: Map<
  string,
  { timer: ReturnType<typeof setTimeout>; startedAt: number }
> = new Map();
