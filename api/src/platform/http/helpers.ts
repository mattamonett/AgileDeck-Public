import type { Request, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { decodeVisitorCookie, VISITOR_COOKIE_NAME } from './visitor-session';
import { logger } from '../logger';

const SESSION_REQUIRED = 'A valid session is required.';

/**
 * Reads the signed visitor cookie. Responds 401 with `message` and returns null
 * when it is missing or invalid, so callers can return early.
 */
export function requireVisitor(
  req: Request,
  res: Response,
  message: string = SESSION_REQUIRED,
): string | null {
  const visitorId = decodeVisitorCookie(req.cookies?.[VISITOR_COOKIE_NAME]).visitorId;
  if (!visitorId) {
    res.status(401).json({ message });
    return null;
  }
  return visitorId;
}

/**
 * Browser mutations must come from an allowed origin. Responds 403 and returns
 * false otherwise, so callers can return early.
 */
export function requireAllowedOrigin(
  req: Request,
  res: Response,
  isOriginAllowed: (origin: string) => boolean,
): boolean {
  const origin = req.get('origin');
  if (origin && isOriginAllowed(origin)) return true;
  res.status(403).json({ message: 'Origin not allowed.' });
  return false;
}

export interface ErrorResponder {
  /** Status for an error whose message is safe to show, or null for an unexpected error. */
  readonly knownStatus: (error: unknown) => number | null;
  readonly logPrefix: string;
  readonly fallbackMessage: string;
}

/** Sends known errors with their status; logs anything else and hides its details. */
export function respondError(res: Response, error: unknown, responder: ErrorResponder): void {
  const status = responder.knownStatus(error);
  if (status !== null && error instanceof Error) {
    res.status(status).json({ message: error.message });
    return;
  }
  logger.error(responder.logPrefix, error);
  res.status(500).json({ message: responder.fallbackMessage });
}

export type LimiterOptions = Pick<Options, 'windowMs' | 'limit' | 'keyGenerator'> &
  Partial<Pick<Options, 'message'>>;

/** A rate limiter that reports standard `RateLimit-*` headers only. */
export function limiter(options: LimiterOptions) {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
