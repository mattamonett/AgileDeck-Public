import { ipKeyGenerator } from 'express-rate-limit';
import { recordRateLimitHit } from '../modules/telemetry/rate-limit-telemetry';
import { getClientIp } from '../platform/http/client-ip';
import { checkRateLimit } from '../platform/concurrency/action-cooldowns';
import { findMember } from '../modules/rooms/room-lookup.service';
import type { AuthorizedSocketData, PokerSocket } from './types';

export async function isAuthorized(
  userId: string | null,
  roomId: string | null,
  visitorId?: string | null,
): Promise<boolean> {
  if (!userId || !roomId) return false;

  const user = await findMember(userId);
  if (!user || user.roomId !== roomId) return false;
  // Server-assigned user IDs should always match; this is defense in depth.
  if (visitorId !== undefined && user.visitorId !== visitorId) return false;

  return user.isApproved;
}

export async function getAuthorizedData(
  socket: PokerSocket,
  rateLimitMs: number,
  actionKey = 'default',
): Promise<AuthorizedSocketData | null> {
  const { userId, roomId } = socket.data;
  if (!userId || !roomId) return null;
  if (!checkRateLimit(`${userId}:${actionKey}`, rateLimitMs)) {
    recordRateLimitHit(socket.data.visitorId);
    return null;
  }
  if (!(await isAuthorized(userId, roomId, socket.data.visitorId))) return null;
  return { ...socket.data, userId, roomId };
}

/** Network budgets group IPv6 clients by subnet, matching the HTTP limits. */
export function socketNetworkKey(clientIp: string): string {
  return clientIp === 'unknown' ? clientIp : ipKeyGenerator(clientIp);
}

export function getSocketClientIp(socket: PokerSocket): string {
  return getClientIp(
    socket.handshake.address || socket.conn?.remoteAddress || 'unknown',
    socket.handshake.headers,
  );
}
