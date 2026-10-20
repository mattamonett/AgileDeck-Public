import { ReplayEnvelopeSchema, SocketEvents } from '@poker/shared';
import { recordRateLimitHit } from '../modules/telemetry/rate-limit-telemetry';
import { WindowBudget } from '../platform/concurrency/window-budget';
import type { PokerSocket } from './types';

/** Every inbound event, known or not, spends from one per-visitor budget. */
const ingress = new WindowBudget(300, 10_000);

const REPLAY_PROTECTED_EVENTS = new Set<string>([
  SocketEvents.VOTE,
  SocketEvents.REVEAL,
  SocketEvents.RESET,
  SocketEvents.UPDATE_ROOM_NAME,
  SocketEvents.TOGGLE_AUTO_REVEAL,
  SocketEvents.UPDATE_MULTIPLIER,
  SocketEvents.UPDATE_THEME,
  SocketEvents.UPDATE_ROOM_MOOD,
  SocketEvents.UPDATE_USER,
  SocketEvents.TOGGLE_OBSERVER,
  SocketEvents.TOGGLE_ISSUES,
  SocketEvents.APPROVE_USER,
  SocketEvents.DENY_USER,
  SocketEvents.NUDGE,
  SocketEvents.NUDGE_STRAGGLERS,
  SocketEvents.THROW_PROJECTILE,
  SocketEvents.BARRAGE_PROJECTILE,
]);

/**
 * Charges every event to the visitor's ingress budget, disconnecting floods,
 * then requires member actions to carry this connection's nonce and the next
 * client sequence number so captured messages cannot be replayed.
 */
export function guardSocketMessages(socket: PokerSocket): void {
  socket.use(([event, payload], next) => {
    if (!socket.data.visitorId || !ingress.consume(socket.data.visitorId)) {
      recordRateLimitHit(socket.data.visitorId);
      next(new Error('Too many messages'));
      socket.disconnect(true);
      return;
    }
    if (!REPLAY_PROTECTED_EVENTS.has(event)) {
      next();
      return;
    }

    const parsed = ReplayEnvelopeSchema.safeParse(payload);
    if (
      !parsed.success ||
      !socket.data.userId ||
      !socket.data.roomId ||
      parsed.data._meta.connectionNonce !== socket.data.connectionNonce ||
      parsed.data._meta.clientSeq !== socket.data.lastClientSeq + 1
    ) {
      next(new Error('Invalid message sequence'));
      return;
    }
    socket.data.lastClientSeq = parsed.data._meta.clientSeq;
    next();
  });
}
