import type { IncomingHttpHeaders } from 'node:http';
import cors from 'cors';
import type { Request, RequestHandler, Response } from 'express';
import { MINUTE_MS } from '../time';
import { ClientError } from '../errors';
import { isStrictIdentityMode } from './visitor-session';
import { logger } from '../logger';

/** Whether a browser origin may call the API; undefined means no Origin header. */
export type OriginCheck = (origin: string | undefined) => boolean;

/**
 * Browsers omit Origin on same-origin GETs, which now include the app's own
 * API calls through the web proxy. They always send Sec-Fetch-Site, and a
 * cross-site page cannot make it say same-origin.
 */
export function isSameOriginRequest(headers: IncomingHttpHeaders): boolean {
  return !headers.origin && headers['sec-fetch-site'] === 'same-origin';
}

/**
 * Allows the listed origins. A request without an Origin is allowed outside
 * production, or in production only when ALLOW_MISSING_SOCKET_ORIGIN is true.
 */
export function originAllowList(allowedOrigins: readonly string[]): OriginCheck {
  return (origin) => {
    if (!origin) {
      return !isStrictIdentityMode() || process.env.ALLOW_MISSING_SOCKET_ORIGIN?.trim() === 'true';
    }
    return allowedOrigins.includes(origin);
  };
}

// Rejected origins are attacker-controlled; summarize them instead of logging each.
const REJECTION_LOG_INTERVAL_MS = MINUTE_MS;
const rejectionCounts = new Map<string, number>();
let rejectionLogDue = 0;

/** Counts a refused origin and logs a summary at most once a minute. */
export function logOriginRejection(kind: 'CORS' | 'Socket.IO'): void {
  rejectionCounts.set(kind, (rejectionCounts.get(kind) ?? 0) + 1);
  const now = Date.now();
  if (now < rejectionLogDue) return;
  rejectionLogDue = now + REJECTION_LOG_INTERVAL_MS;
  const summary = [...rejectionCounts].map(([name, count]) => `${name}: ${count}`).join(', ');
  rejectionCounts.clear();
  logger.warn(`Blocked requests from disallowed origins (${summary}).`);
}

export class CorsRejectedError extends ClientError {
  constructor() {
    super(403, 'Origin not allowed.');
  }
}

/** CORS for allowed and same-origin requests; anything else fails with 403. */
export function originCors(isOriginAllowed: OriginCheck): RequestHandler {
  return cors((req, callback) => {
    if (isOriginAllowed(req.headers.origin) || isSameOriginRequest(req.headers)) {
      callback(null, {
        origin: true,
        credentials: true,
        optionsSuccessStatus: 200,
      });
    } else {
      logOriginRejection('CORS');
      callback(new CorsRejectedError());
    }
  });
}

/** Lets an allowed cross-origin caller read the response with credentials. */
export function allowCredentialedOrigin(
  req: Request,
  res: Response,
  isOriginAllowed: OriginCheck,
): void {
  const origin = req.get('origin');
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}
