import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createFeedbackRouter } from './modules/feedback/feedback.routes';
import { createIssuesRouter } from './modules/issues/issues.routes';
import { createRoomStatsRouter } from './modules/rooms/room-stats.routes';
import { createSessionRouter } from './modules/site/session.routes';
import { createSiteAccessRouter, siteAccessGate } from './modules/site/site-access.routes';
import { createSiteInfoRouter } from './modules/site/site-info.routes';
import { observeHttpRateLimits } from './modules/telemetry/rate-limit-telemetry';
import { httpClientKey } from './platform/http/client-ip';
import { apiSecurityHeaders, handleApiError } from './platform/http/hardening';
import { memberContext } from './platform/http/member-context.middleware';
import { originCors, type OriginCheck } from './platform/http/origin-policy';
import type { PokerServer } from './socket/types';

const GLOBAL_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_REQUESTS_PER_WINDOW = 1000;

export interface AppDependencies {
  /** Issue routes tell the room's sockets to reload the board. */
  readonly io: PokerServer;
  readonly isOriginAllowed: OriginCheck;
  readonly secureCookies: boolean;
  readonly buildTime: string;
}

/**
 * The public HTTP API. Order is a security boundary: the network limiter runs
 * before cookie parsing, the site password gate before every router, and each
 * router's own access checks before its body parser and the shared JSON parser.
 * The admin router passes the site password gate and applies its own password.
 */
export function createApp({
  io,
  isOriginAllowed,
  secureCookies,
  buildTime,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  // Rate limits read X-Forwarded-For only from TRUSTED_PROXY_IPS (platform/http/client-ip.ts).
  app.set('trust proxy', 0);

  app.use(apiSecurityHeaders);
  app.use(originCors(isOriginAllowed));
  // Engine.IO intercepts its own routes; every request reaching Express is limited.
  app.use(observeHttpRateLimits);
  app.use(
    rateLimit({
      windowMs: GLOBAL_LIMIT_WINDOW_MS,
      max: GLOBAL_REQUESTS_PER_WINDOW,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: httpClientKey,
      message: {
        status: 429,
        message: 'Too many requests from this IP, please try again later.',
      },
      validate: { ip: true },
    }),
  );
  app.use(cookieParser());
  // When the site password protects everything, only the routes the password
  // page needs answer before it is entered.
  app.use(siteAccessGate);
  // Admin work is not member work: like the former separate admin listener, it
  // runs outside member deletion leases, so it never conflicts with the
  // deletions it performs.
  app.use('/api/admin', createAdminRouter(isOriginAllowed, secureCookies));
  app.use(memberContext);

  app.use('/api/rooms', createRoomStatsRouter());
  app.use('/api/rooms', createIssuesRouter(io, isOriginAllowed));
  app.use('/api/feedback', createFeedbackRouter(isOriginAllowed));
  app.use('/api/access', createSiteAccessRouter(isOriginAllowed, secureCookies));
  app.use(express.json({ inflate: false }));

  app.use(createSessionRouter(isOriginAllowed, secureCookies));
  app.use(createSiteInfoRouter(isOriginAllowed, buildTime));

  // Errors never expose stack traces or internal messages.
  app.use(handleApiError);
  return app;
}
