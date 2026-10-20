import type { ErrorRequestHandler } from 'express';
import { ClientError } from '../../platform/errors';
import { logger } from '../../platform/logger';

/** An admin request failed for a reason that is safe to show the admin. */
export class AdminError extends ClientError {}

/** Shows safe admin failures and body-parser rejections; hides everything else. */
export const handleAdminError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AdminError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  ) {
    res.status(error.status).json({ message: 'Invalid admin request body.' });
    return;
  }
  logger.warn('Feedback admin request failed.');
  res.status(500).json({ message: 'Could not complete the admin request.' });
};
