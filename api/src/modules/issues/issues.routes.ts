import { Router, json, type Response } from 'express';
import { httpClientKey } from '../../platform/http/client-ip';
import {
  CreateIssueSchema,
  UpdateIssueSchema,
  IssueAccessSchema,
  IssueIdSchema,
  IssueCursorSchema,
  GameEvents,
  ImportIssuesSchema,
  ISSUE_IMPORT_MAX_BYTES,
  type UsageMetric,
} from '@poker/shared';
import {
  IssueMutationKind,
  type IssueMutation,
  listIssues,
  mutateIssue,
  exportIssues,
  startNextIssue,
  countClosedIssues,
  deleteClosedIssues,
} from './issue.service';
import { IssueError } from './issue-errors';
import { importIssues } from './issue-import.service';
import type { PokerServer } from '../../socket/types';
import { isApprovedMember } from '../rooms/room-lookup.service';
import {
  limiter,
  requireAllowedOrigin,
  requireVisitor,
  respondError,
} from '../../platform/http/helpers';
import { responseLocal } from '../../platform/http/response-local';
import { recordUsage } from '../telemetry/usage-telemetry';
import { getSiteConfig } from '../../config/site-config';
import { AbuseLimitError } from '../../platform/db/abuse-quota';

const MAX_CURSOR_LENGTH = 250;

type IssueAccess = ReturnType<typeof IssueAccessSchema.parse> & {
  readonly visitorId: string;
};

const issueAccess = responseLocal<IssueAccess>(
  () => new IssueError(401, 'A valid session is required.'),
);

const issueMutationMetrics = {
  post: 'issue.created',
  put: 'issue.updated',
  delete: 'issue.deleted',
} as const satisfies Record<'post' | 'put' | 'delete', UsageMetric>;

export function createIssuesRouter(io: PokerServer, isOriginAllowed: (origin: string) => boolean) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(limiter({ windowMs: 60_000, limit: 120, keyGenerator: httpClientKey }));
  router.use('/:roomId/issues', (_req, res, next) => {
    if (getSiteConfig().features.issues) {
      next();
      return;
    }
    res.status(404).json({ message: 'Issues are not available on this site.' });
  });
  router.use('/:roomId/issues', async (req, res, next) => {
    // Room and user ids alone are not credentials: bind them to the signed cookie.
    const access = IssueAccessSchema.safeParse({
      roomId: req.params.roomId,
      userId: req.query.userId,
    });
    if (!access.success) {
      res.status(400).json({ message: 'Valid roomId and userId are required.' });
      return;
    }
    const visitorId = requireVisitor(req, res);
    if (!visitorId) return;
    if (req.method !== 'GET' && !requireAllowedOrigin(req, res, isOriginAllowed)) return;
    issueAccess.set(res, { ...access.data, visitorId });
    const isMember = await isApprovedMember(access.data.roomId, access.data.userId, visitorId);
    if (!isMember) {
      res.status(403).json({ message: 'You do not have access to this room.' });
      return;
    }
    next();
  });
  const userLimiter = limiter({
    windowMs: 60_000,
    limit: 90,
    keyGenerator: (_req, res) => getIssueAccess(res).visitorId,
  });
  router.use('/:roomId/issues', userLimiter);
  router.use('/:roomId/issues/import', json({ limit: ISSUE_IMPORT_MAX_BYTES, inflate: false }));
  // Parse bodies only on issue routes, after the visitor and membership checks.
  router.use('/:roomId/issues', json({ limit: '100kb', inflate: false }));
  router.get('/:roomId/issues', async (req, res) => {
    try {
      let cursor;
      if (req.query.cursor !== undefined) {
        if (typeof req.query.cursor !== 'string' || req.query.cursor.length > MAX_CURSOR_LENGTH)
          throw new IssueError(400, 'Invalid page cursor.');
        try {
          cursor = IssueCursorSchema.parse(JSON.parse(req.query.cursor));
        } catch {
          throw new IssueError(400, 'Invalid page cursor.');
        }
      }
      const { roomId, userId, visitorId } = getIssueAccess(res);
      res.json(await listIssues(roomId, userId, visitorId, cursor));
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  router.get('/:roomId/issues/export', async (_req, res) => {
    try {
      const { roomId, userId, visitorId } = getIssueAccess(res);
      res.json(await exportIssues(roomId, userId, visitorId));
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  router.post('/:roomId/issues/import', async (req, res) => {
    try {
      const parsed = ImportIssuesSchema.safeParse(req.body);
      if (!parsed.success)
        throw new IssueError(400, parsed.error.issues[0]?.message ?? 'Invalid import.');
      const { roomId, userId, visitorId } = getIssueAccess(res);
      const result = await importIssues(
        roomId,
        userId,
        { visitorId, network: httpClientKey(req) },
        parsed.data,
      );
      recordUsage('issue.imported');
      io.to(roomId).emit(GameEvents.ISSUES_CHANGED, { roomId });
      res.status(201).json(result);
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  router.post('/:roomId/issues/next', async (_req, res) => {
    try {
      const { roomId, userId, visitorId } = getIssueAccess(res);
      const id = await startNextIssue(roomId, userId, visitorId);
      recordUsage('issue.nextStarted');
      io.to(roomId).emit(GameEvents.ISSUES_CHANGED, { roomId });
      res.json({ id });
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  // Registered before /:issueId so "closed" is never parsed as an issue id.
  router.get('/:roomId/issues/closed', async (_req, res) => {
    try {
      const { roomId, userId, visitorId } = getIssueAccess(res);
      res.json({ count: await countClosedIssues(roomId, userId, visitorId) });
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  router.delete('/:roomId/issues/closed', async (_req, res) => {
    try {
      const { roomId, userId, visitorId } = getIssueAccess(res);
      const count = await deleteClosedIssues(roomId, userId, visitorId);
      if (count) {
        recordUsage('issue.closedCleared');
        io.to(roomId).emit(GameEvents.ISSUES_CHANGED, { roomId });
      }
      res.json({ count });
    } catch (error) {
      respondIssueError(res, error);
    }
  });
  for (const method of ['post', 'put', 'delete'] as const) {
    router[method](
      method === 'post' ? '/:roomId/issues' : '/:roomId/issues/:issueId',
      async (req, res) => {
        try {
          const command = parseIssueMutation(
            method,
            'issueId' in req.params ? req.params.issueId : undefined,
            req.body,
          );
          const { roomId, userId, visitorId } = getIssueAccess(res);
          const savedId = await mutateIssue(roomId, userId, visitorId, command);
          recordUsage(issueMutationMetrics[method]);
          // Only invalidation is broadcast; every client's subsequent read is authorized.
          io.to(roomId).emit(GameEvents.ISSUES_CHANGED, { roomId });
          if (method === 'delete') res.status(204).end();
          else res.status(method === 'post' ? 201 : 200).json({ id: savedId });
        } catch (error) {
          respondIssueError(res, error);
        }
      },
    );
  }
  return router;
}

function respondIssueError(res: Response, error: unknown) {
  respondError(res, error, {
    knownStatus: (cause) =>
      cause instanceof IssueError ? cause.status : cause instanceof AbuseLimitError ? 429 : null,
    logPrefix: 'Issue request failed:',
    fallbackMessage: 'Could not complete the issue request.',
  });
}

function parseIssueMutation(
  method: 'post' | 'put' | 'delete',
  id: unknown,
  body: unknown,
): IssueMutation {
  if (method === 'post') {
    const parsed = CreateIssueSchema.safeParse(body);
    if (!parsed.success) throw new IssueError(400, 'Invalid issue fields.');
    return { kind: IssueMutationKind.CREATE, input: parsed.data };
  }
  const parsedId = IssueIdSchema.safeParse(id);
  if (!parsedId.success) throw new IssueError(400, 'Invalid issue id.');
  if (method === 'delete') return { kind: IssueMutationKind.DELETE, id: parsedId.data };
  const parsed = UpdateIssueSchema.safeParse(body);
  if (!parsed.success) throw new IssueError(400, 'Invalid issue fields.');
  return {
    kind: IssueMutationKind.UPDATE,
    id: parsedId.data,
    input: parsed.data,
  };
}

function getIssueAccess(res: Response): IssueAccess {
  return issueAccess.get(res);
}
