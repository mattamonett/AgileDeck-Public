import { AsyncLocalStorage } from 'node:async_hooks';

interface Lease {
  valid: boolean;
  deleting: boolean;
  /** Synchronous or promised work currently running under this lease. */
  holders: number;
}
const scopes = new Map<string, Lease>();
const context = new AsyncLocalStorage<readonly Lease[]>();
const MAX_SCOPES = 10_000;
export class DeletionConflictError extends Error {
  readonly status = 409;
  constructor() {
    super('An administrator deleted or is deleting this data. Refresh before continuing.');
  }
}
export class LeaseCapacityError extends Error {
  readonly status = 503;
  constructor() {
    super('The server is busy. Please try again shortly.');
  }
}
function lease(key: string): Lease {
  const existing = scopes.get(key);
  if (existing) {
    scopes.delete(key);
    scopes.set(key, existing);
    return existing;
  }
  if (scopes.size >= MAX_SCOPES) evictIdleLease();
  const value = { valid: true, deleting: false, holders: 0 };
  scopes.set(key, value);
  return value;
}
/**
 * Evicts the least recently used lease that no running work holds. Eviction never
 * invalidates in-flight work; when every lease is busy the new caller is refused.
 * Evicted leases are still invalidated so timers they scheduled cannot outlive a
 * later deletion fence for the same key.
 */
function evictIdleLease(): void {
  for (const [key, value] of scopes) {
    if (value.holders > 0 || value.deleting) continue;
    value.valid = false;
    scopes.delete(key);
    return;
  }
  throw new LeaseCapacityError();
}
function release(leases: readonly Lease[]): void {
  for (const entry of leases) entry.holders--;
}
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}
export function assertDeletionContext(): void {
  if (context.getStore()?.some((entry) => !entry.valid)) throw new DeletionConflictError();
}
/** Runs work under member leases, holding them until returned promises settle. */
export function withMemberContext<T>(
  visitorId: string | null | undefined,
  roomId: string | null | undefined,
  work: () => T,
): T {
  const leases = [
    ...(visitorId ? [lease('visitor:' + visitorId)] : []),
    ...(roomId ? [lease('room:' + roomId)] : []),
  ];
  for (const entry of leases) entry.holders++;
  let result: T;
  try {
    result = context.run(leases, () => {
      assertDeletionContext();
      return work();
    });
  } catch (error) {
    release(leases);
    throw error;
  }
  if (!isPromiseLike(result)) {
    release(leases);
    return result;
  }
  result.then(
    () => release(leases),
    () => release(leases),
  );
  return result;
}
export async function withDeletionFence<T>(
  kind: 'visitor' | 'room',
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = kind + ':' + id;
  const previous = lease(key);
  if (previous.deleting) throw new DeletionConflictError();
  previous.valid = false;
  const barrier = { valid: false, deleting: true, holders: 0 };
  scopes.set(key, barrier);
  try {
    return await work();
  } finally {
    barrier.deleting = false;
    scopes.set(key, { valid: true, deleting: false, holders: 0 });
  }
}

export function isDeletionContextValid(): boolean {
  return !context.getStore()?.some((entry) => !entry.valid);
}
export function isVisitorDeleting(visitorId: string): boolean {
  return scopes.get('visitor:' + visitorId)?.deleting ?? false;
}
