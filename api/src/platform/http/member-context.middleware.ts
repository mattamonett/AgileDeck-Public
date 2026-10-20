import { JoinRoomSchema } from '@poker/shared';
import type { RequestHandler } from 'express';
import { withMemberContext } from '../concurrency/deletion-context';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from './visitor-session';

const ROOM_PATH = /^\/api\/rooms\/([^/]+)/;

/**
 * Runs the rest of the request under the visitor's and room's deletion leases,
 * so an administrator's deletion cannot interleave with it.
 */
export const memberContext: RequestHandler = (req, res, next) => {
  try {
    const visitor = decodeVisitorCookie(req.cookies?.[VISITOR_COOKIE_NAME]).visitorId;
    // Only well-formed room IDs take a deletion lease; other paths cannot match a room.
    const segment = ROOM_PATH.exec(req.path)?.[1];
    const roomId = segment
      ? JoinRoomSchema.shape.roomId.safeParse(decodeURIComponent(segment))
      : null;
    // Hold the leases until the response ends, not just until routing returns.
    const responseClosed = new Promise<void>((resolve) => res.once('close', resolve));
    withMemberContext(visitor, roomId?.success ? roomId.data : null, () => {
      next();
      return responseClosed;
    });
  } catch (error) {
    next(error);
  }
};
