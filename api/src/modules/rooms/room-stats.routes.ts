import { Router } from 'express';
import { RoomStatsQuerySchema } from '@poker/shared';
import { MINUTE_MS } from '../../platform/time';
import { httpClientKey } from '../../platform/http/client-ip';
import { readRoomStats } from './room-stats.service';
import { limiter, requireVisitor } from '../../platform/http/helpers';

export function createRoomStatsRouter() {
  const router = Router();
  router.get(
    '/:roomId/stats',
    limiter({ windowMs: MINUTE_MS, limit: 30, keyGenerator: httpClientKey }),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const query = RoomStatsQuerySchema.safeParse({
        ...req.query,
        roomId: req.params.roomId,
      });
      if (!query.success) {
        res.status(400).json({ message: 'Invalid stats request.' });
        return;
      }
      const visitorId = requireVisitor(req, res, 'Join this room to see its stats.');
      if (!visitorId) return;
      const stats = await readRoomStats(
        query.data.roomId,
        visitorId,
        query.data.page,
        query.data.sort,
      );
      if (!stats) {
        res.status(403).json({ message: 'Room stats are available to approved members.' });
        return;
      }
      res.json(stats);
    },
  );
  return router;
}
