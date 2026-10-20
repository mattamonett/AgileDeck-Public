import { ClientError } from '../../../src/platform/errors';
import { CorsRejectedError } from '../../../src/platform/http/origin-policy';
import { AdminError } from '../../../src/modules/admin/admin-errors';
import { FeedbackError, FeedbackReplyError } from '../../../src/modules/feedback/feedback-errors';
import { IssueError } from '../../../src/modules/issues/issue-errors';

describe('client errors', () => {
  it.each([
    ['admin', new AdminError(404, 'Room not found.')],
    ['feedback', new FeedbackError(429, 'Too many votes from this network.')],
    ['reply', new FeedbackReplyError(403, 'Origin not allowed.')],
    ['issue', new IssueError(409, 'Import would exceed the room limit.')],
  ])('carries a safe status and message for %s requests', (_kind, error) => {
    expect(error).toBeInstanceOf(ClientError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBeGreaterThanOrEqual(400);
    expect(error.message).not.toBe('');
  });

  it('rejects CORS with 403', () => {
    const error = new CorsRejectedError();
    expect(error).toBeInstanceOf(ClientError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Origin not allowed.');
  });
});
