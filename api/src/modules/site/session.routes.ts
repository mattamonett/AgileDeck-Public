import crypto from 'node:crypto';
import { Router } from 'express';
import { ApiPath } from '@poker/shared';
import { DAY_MS } from '../../platform/time';
import { allowCredentialedOrigin, type OriginCheck } from '../../platform/http/origin-policy';
import {
  decodeVisitorCookie,
  encodeVisitorCookie,
  LEGACY_VISITOR_COOKIE_NAMES,
  VISITOR_COOKIE_NAME,
} from '../../platform/http/visitor-session';

const VISITOR_COOKIE_MAX_AGE_MS = 365 * DAY_MS;

/** GET /api/init issues the signed, HttpOnly visitor cookie every other route relies on. */
export function createSessionRouter(isOriginAllowed: OriginCheck, secureCookies: boolean): Router {
  const router = Router();
  router.get(ApiPath.INIT, (req, res) => {
    allowCredentialedOrigin(req, res, isOriginAllowed);
    const visitorId =
      decodeVisitorCookie(req.cookies[VISITOR_COOKIE_NAME]).visitorId ?? crypto.randomUUID();

    // The web server proxies the API on the same origin, so Lax cookies reach it.
    const cookieOptions = {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax' as const,
      maxAge: VISITOR_COOKIE_MAX_AGE_MS,
    };
    for (const legacyName of LEGACY_VISITOR_COOKIE_NAMES) {
      res.clearCookie(legacyName, {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
      });
    }
    // Reissue on every visit so attributes and the signing secret stay current.
    res.cookie(VISITOR_COOKIE_NAME, encodeVisitorCookie(visitorId), cookieOptions);
    res.send({ status: 'ok' });
  });
  return router;
}
