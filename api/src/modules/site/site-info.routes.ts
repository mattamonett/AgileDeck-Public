import { Router } from 'express';
import { getPublicSiteConfig } from '../../config/site-config';
import { allowCredentialedOrigin, type OriginCheck } from '../../platform/http/origin-policy';
import {
  christmasAvailability,
  halloweenAvailability,
  thanksgivingAvailability,
} from '../interactions/seasonal-throwables.service';
import { seasonalThemeAvailability } from '../rooms/room-appearance';

/** Public settings, seasonal availability and the running version. */
export function createSiteInfoRouter(isOriginAllowed: OriginCheck, buildTime: string): Router {
  const router = Router();
  router.get('/api/site-config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(getPublicSiteConfig());
  });

  router.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send({
      ...halloweenAvailability(),
      ...thanksgivingAvailability(),
      ...christmasAvailability(),
      ...seasonalThemeAvailability(),
    });
  });

  // The version check uses /api/version behind the web proxy; / serves direct callers.
  router.get(['/', '/api/version'], (req, res) => {
    allowCredentialedOrigin(req, res, isOriginAllowed);
    res.send({
      status: 'ok',
      message: 'Poker API is running',
      version: buildTime,
    });
  });
  return router;
}
