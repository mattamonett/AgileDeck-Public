import { ClientError } from '../../platform/errors';

/** An issue request failed for a reason that is safe to show the member. */
export class IssueError extends ClientError {}
