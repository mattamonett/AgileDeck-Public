import { WindowBudget } from '../platform/concurrency/window-budget';

// Socket admission budgets. Network keys group IPv6 clients by subnet.
/** Socket.IO namespace connections per network: 120 a minute. */
export const CONNECTION_BUDGET = new WindowBudget(120, 60_000);
/** Join attempts per network: 120 a minute. */
export const JOIN_NETWORK_BUDGET = new WindowBudget(120, 60_000);
/** Join attempts per `${visitorId}:${roomId}`: 10 every 10 seconds. */
export const JOIN_BUDGET = new WindowBudget(10, 10_000);
/** Health checks per network: 12 a minute. */
export const HEALTH_BUDGET = new WindowBudget(12, 60_000);
