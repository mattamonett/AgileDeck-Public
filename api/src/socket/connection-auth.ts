import cookie from 'cookie';
import type { ExtendedError } from 'socket.io';
import { isUnlockedFor } from '../modules/site/site-access';
import { recordCookieRateLimitHit } from '../modules/telemetry/rate-limit-telemetry';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from '../platform/http/visitor-session';
import { getSocketClientIp, socketNetworkKey } from './authorization';
import { CONNECTION_BUDGET } from './rate-limits';
import type { PokerSocket } from './types';

/**
 * Namespace middleware: budgets connections per network, then binds the socket
 * to the signed visitor cookie. Identity never comes from client messages.
 */
export function authenticateConnection(
  socket: PokerSocket,
  next: (err?: ExtendedError) => void,
): void {
  try {
    const clientIp = getSocketClientIp(socket);
    if (!CONNECTION_BUDGET.consume(socketNetworkKey(clientIp))) {
      recordCookieRateLimitHit(socket.request.headers.cookie);
      return next(new Error('Too many connection attempts. Please try again in a minute.'));
    }

    const cookies = cookie.parse(socket.request.headers.cookie || '');
    const { visitorId } = decodeVisitorCookie(cookies[VISITOR_COOKIE_NAME]);
    if (!visitorId) {
      return next(new Error(`Authentication error: Missing ${VISITOR_COOKIE_NAME} cookie`));
    }
    // Engine.IO admission checks this first; the namespace keeps its own guard.
    if (!isUnlockedFor('everything', socket.request.headers.cookie, visitorId))
      return next(new Error('The site password is required.'));
    socket.data.visitorId = visitorId;
    socket.data.clientIp = clientIp;
    next();
  } catch {
    next(new Error('Authentication error: Invalid cookie parsing'));
  }
}
