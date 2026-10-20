import { ClientError } from '../../platform/errors';

/** A feedback request failed for a reason that is safe to show the visitor. */
export class FeedbackError extends ClientError {}

/** A reply request failed for a reason that is safe to show the caller. */
export class FeedbackReplyError extends ClientError {}
