import { Router } from 'express';
import { getSiteConfig } from '../../../config/site-config';
import { readUsageSummary } from '../../telemetry/usage.service';

export function createUsageRouter(): Router {
  const router = Router();
  router.get('/usage', async (_req, res, next) => {
    try {
      res.json(
        getSiteConfig().features.usageStats ? await readUsageSummary() : { usageStats: 'off' },
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
