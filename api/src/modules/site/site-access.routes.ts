import { json, Router, type NextFunction, type Request, type Response } from 'express';
import { SiteAccessRequestSchema, type SiteAccessStatus } from '@poker/shared';
import { AbuseLimitError, claimDailyQuotas } from '../../platform/db/abuse-quota';
import { httpClientKey } from '../../platform/http/client-ip';
import {
  encodeSiteAccessCookie,
  isUnlockedFor,
  OPEN_API_PATHS,
  passwordMatches,
  SITE_ACCESS_COOKIE_NAME,
  SITE_ACCESS_MAX_AGE_MS,
} from './site-access';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../platform/http/visitor-session';
import { limiter, requireAllowedOrigin, requireVisitor } from '../../platform/http/helpers';

/** Password attempts per network: a short window, then a durable daily budget. */
export const SITE_ACCESS_ATTEMPTS_PER_WINDOW = 10;
const SITE_ACCESS_WINDOW_MS = 15 * 60_000;
export const SITE_ACCESS_ATTEMPTS_PER_NETWORK_DAY = 30;
export const SITE_ACCESS_ATTEMPTS_PER_DAY = 1000;

function visitorOf(req: Request): string | null {
  return decodeVisitorCookie(req.cookies?.[VISITOR_COOKIE_NAME]).visitorId;
}

/** Whether this browser entered the password, or none applies. */
function isUnlocked(req: Request): boolean {
  return isUnlockedFor('room-creation', req.headers.cookie, visitorOf(req));
}

/** The admin API has its own password, so an operator can reach it on a locked site. */
function isAdminPath(path: string): boolean {
  return path === '/api/admin' || path.startsWith('/api/admin/');
}

/**
 * Refuses every API route but the few the password page needs, and the admin
 * API, when the password protects everything. Runs after cookie parsing,
 * before any router.
 */
export function siteAccessGate(req: Request, res: Response, next: NextFunction): void {
  if (
    OPEN_API_PATHS.has(req.path) ||
    isAdminPath(req.path) ||
    isUnlockedFor('everything', req.headers.cookie, visitorOf(req))
  ) {
    next();
    return;
  }
  res.status(401).json({ message: 'Enter the site password to continue.' });
}

function sendStatus(res: Response, unlocked: boolean): void {
  const status: SiteAccessStatus = { unlocked };
  res.json(status);
}

/**
 * GET /api/access says whether this browser has entered the site password (or
 * none is needed); POST /api/access checks one and sets the access cookie.
 */
export function createSiteAccessRouter(
  isOriginAllowed: (origin: string) => boolean,
  secureCookies: boolean,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/', (req, res) => {
    sendStatus(res, isUnlocked(req));
  });

  const attempts = limiter({
    windowMs: SITE_ACCESS_WINDOW_MS,
    limit: SITE_ACCESS_ATTEMPTS_PER_WINDOW,
    keyGenerator: httpClientKey,
    message: {
      message: 'Too many password attempts. Please wait and try again.',
    },
  });

  router.post(
    '/',
    attempts,
    (req, res, next) => {
      if (!requireAllowedOrigin(req, res, isOriginAllowed)) return;
      if (!requireVisitor(req, res)) return;
      next();
    },
    json({ limit: '1kb', inflate: false }),
    async (req, res, next) => {
      try {
        const visitorId = requireVisitor(req, res);
        if (!visitorId) return;
        if (isUnlocked(req)) {
          sendStatus(res, true);
          return;
        }
        const parsed = SiteAccessRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ message: 'Enter the site password.' });
          return;
        }
        // Charged before comparing, so a refused attempt reveals nothing.
        await claimDailyQuotas([
          {
            scope: 'site-access-network',
            identity: httpClientKey(req),
            limit: SITE_ACCESS_ATTEMPTS_PER_NETWORK_DAY,
          },
          {
            scope: 'site-access-global',
            identity: 'all',
            limit: SITE_ACCESS_ATTEMPTS_PER_DAY,
          },
        ]);
        if (!passwordMatches(parsed.data.password)) {
          res.status(401).json({ message: 'That password is not right.' });
          return;
        }
        res.cookie(SITE_ACCESS_COOKIE_NAME, encodeSiteAccessCookie(visitorId), {
          httpOnly: true,
          secure: secureCookies,
          sameSite: 'lax',
          maxAge: SITE_ACCESS_MAX_AGE_MS,
        });
        sendStatus(res, true);
      } catch (error) {
        if (error instanceof AbuseLimitError) {
          res.status(429).json({
            message: 'Too many password attempts today. Please try again tomorrow.',
          });
          return;
        }
        next(error);
      }
    },
  );
  return router;
}
