import { json, Router, type Request, type RequestHandler, type Response } from 'express';
import { AdminSignInRequestSchema, type AdminSessionStatus } from '@poker/shared';
import { AbuseLimitError, claimDailyQuotas } from '../../platform/db/abuse-quota';
import { httpClientKey } from '../../platform/http/client-ip';
import { limiter, requireAllowedOrigin, requireVisitor } from '../../platform/http/helpers';
import type { OriginCheck } from '../../platform/http/origin-policy';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from '../../platform/http/visitor-session';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_PATH,
  ADMIN_SESSION_MAX_AGE_MS,
  adminPasswordMatches,
  encodeAdminCookie,
  isAdminCookieValid,
  isAdminEnabled,
} from './admin-access';
import { handleAdminError } from './admin-errors';
import { createAdminFeedbackRouter } from './routes/feedback.routes';
import { createReviewRouter } from './routes/review.routes';
import { createRoomsRouter } from './routes/rooms.routes';
import { createUsageRouter } from './routes/usage.routes';

export const ADMIN_REQUESTS_PER_MINUTE = 120;
/** Password attempts per network: a short window, then durable daily budgets. */
export const ADMIN_SIGN_IN_ATTEMPTS_PER_WINDOW = 5;
const ADMIN_SIGN_IN_WINDOW_MS = 15 * 60_000;
export const ADMIN_SIGN_IN_ATTEMPTS_PER_NETWORK_DAY = 20;
export const ADMIN_SIGN_IN_ATTEMPTS_PER_DAY = 200;

const SIGN_IN_REQUIRED = 'Sign in to the admin page to continue.';

function isSignedIn(req: Request): boolean {
  const visitorId = decodeVisitorCookie(req.cookies?.[VISITOR_COOKIE_NAME]).visitorId;
  return isAdminCookieValid(req.cookies?.[ADMIN_COOKIE_NAME], visitorId);
}

function sendStatus(res: Response, signedIn: boolean): void {
  const status: AdminSessionStatus = signedIn
    ? {
        signedIn: true,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      }
    : { signedIn: false };
  res.json(status);
}

/** A present Origin header naming the site; a missing one never passes here. */
function adminOriginCheck(isOriginAllowed: OriginCheck): (origin: string) => boolean {
  return (origin) => origin !== '' && isOriginAllowed(origin);
}

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Without ADMIN_PASSWORD the admin does not exist: every route answers 404. */
const requireAdminEnabled: RequestHandler = (_req, res, next) => {
  if (isAdminEnabled()) {
    next();
    return;
  }
  res.status(404).json({ message: 'Admin endpoint not found.' });
};

/**
 * GET says whether this browser is signed in; POST checks the password and sets
 * the admin cookie; DELETE signs out.
 */
function createAdminSessionRouter(
  isAdminOrigin: (origin: string) => boolean,
  secureCookies: boolean,
): Router {
  const router = Router();
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'strict',
    path: ADMIN_COOKIE_PATH,
  } as const;

  router.get('/', (req, res) => {
    sendStatus(res, isSignedIn(req));
  });

  const attempts = limiter({
    windowMs: ADMIN_SIGN_IN_WINDOW_MS,
    limit: ADMIN_SIGN_IN_ATTEMPTS_PER_WINDOW,
    keyGenerator: httpClientKey,
    message: { message: 'Too many password attempts. Please wait and try again.' },
  });

  router.post(
    '/',
    attempts,
    (req, res, next) => {
      if (!requireAllowedOrigin(req, res, isAdminOrigin)) return;
      if (!requireVisitor(req, res)) return;
      next();
    },
    json({ limit: '1kb', inflate: false }),
    async (req, res, next) => {
      try {
        const visitorId = requireVisitor(req, res);
        if (!visitorId) return;
        if (isSignedIn(req)) {
          sendStatus(res, true);
          return;
        }
        const parsed = AdminSignInRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ message: 'Enter the admin password.' });
          return;
        }
        // Charged before comparing, so a refused attempt reveals nothing.
        await claimDailyQuotas([
          {
            scope: 'admin-sign-in-network',
            identity: httpClientKey(req),
            limit: ADMIN_SIGN_IN_ATTEMPTS_PER_NETWORK_DAY,
          },
          {
            scope: 'admin-sign-in-global',
            identity: 'all',
            limit: ADMIN_SIGN_IN_ATTEMPTS_PER_DAY,
          },
        ]);
        if (!adminPasswordMatches(parsed.data.password)) {
          res.status(401).json({ message: 'That password is not right.' });
          return;
        }
        res.cookie(ADMIN_COOKIE_NAME, encodeAdminCookie(visitorId), {
          ...cookieOptions,
          maxAge: ADMIN_SESSION_MAX_AGE_MS,
        });
        sendStatus(res, true);
      } catch (error) {
        if (error instanceof AbuseLimitError) {
          res.status(429).json({
            message: 'Too many admin password attempts today. Please try again tomorrow.',
          });
          return;
        }
        next(error);
      }
    },
  );

  router.delete('/', (req, res) => {
    if (!requireAllowedOrigin(req, res, isAdminOrigin)) return;
    res.clearCookie(ADMIN_COOKIE_NAME, cookieOptions);
    sendStatus(res, false);
  });
  return router;
}

/** Reads need the admin cookie for this browser ID; writes also need the site's Origin. */
function requireAdmin(isAdminOrigin: (origin: string) => boolean): RequestHandler {
  return (req, res, next) => {
    if (!isSignedIn(req)) {
      res.status(401).json({ message: SIGN_IN_REQUIRED });
      return;
    }
    if (req.method !== 'GET' && !isAdminOrigin(req.get('origin') ?? '')) {
      res.status(403).json({ message: 'Origin not allowed.' });
      return;
    }
    next();
  };
}

/**
 * The admin API under /api/admin on the public app. ADMIN_PASSWORD is the only
 * credential: the site password does not apply here, so an operator can reach
 * the admin page on a locked site. Every guard runs before the route parsers.
 */
export function createAdminRouter(isOriginAllowed: OriginCheck, secureCookies: boolean): Router {
  const isAdminOrigin = adminOriginCheck(isOriginAllowed);
  const router = Router();
  router.use(noStore);
  router.use(requireAdminEnabled);
  router.use(
    limiter({
      windowMs: 60_000,
      limit: ADMIN_REQUESTS_PER_MINUTE,
      keyGenerator: httpClientKey,
      message: { message: 'Too many admin requests. Please wait a moment.' },
    }),
  );
  router.use('/session', createAdminSessionRouter(isAdminOrigin, secureCookies));
  router.use(requireAdmin(isAdminOrigin));
  router.use(createUsageRouter());
  router.use(createRoomsRouter());
  router.use(createAdminFeedbackRouter(isAdminOrigin));
  router.use(createReviewRouter());
  router.use((_req, res) => {
    res.status(404).json({ message: 'Admin endpoint not found.' });
  });
  router.use(handleAdminError);
  return router;
}
