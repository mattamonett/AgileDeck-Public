import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logger';

/** JSON API responses never need to load, frame, or sniff anything. */
export const apiSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
};

function errorStatus(error: unknown): number {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 600
    ? error.status
    : 500;
}

/** Reports client errors plainly and never exposes server error details or stacks. */
export const handleApiError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = errorStatus(error);
  if (status >= 500) logger.error('Unhandled request error:', error);
  const message =
    (status < 500 || status === 503) && error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';
  res.status(status).json({ message });
};
