import { Router, json, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateFeedbackReplySchema, ReadFeedbackRepliesSchema } from '@poker/shared';
import { AbuseLimitError } from '../../platform/db/abuse-quota';
import { FeedbackReplyError } from './feedback-errors';
import type { ReplyActor } from './reply-access';
import {
  accessReplies,
  createReply,
  listReplies,
  markRepliesRead,
  requireReplyPermission,
} from './feedback-reply.service';
import { limiter } from '../../platform/http/helpers';

export function createFeedbackRepliesRouter(
  actorFor: (req: Request, res: Response) => ReplyActor,
  originAllowed: (origin: string) => boolean,
) {
  const router = Router({ mergeParams: true });
  const actors = new WeakMap<Request, { id: string; actor: ReplyActor }>();
  router.use(async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ message: 'Feedback item not found.' });
      return;
    }
    try {
      const actor = actorFor(req, res);
      const access = await accessReplies(id.data, actor);
      if (req.method !== 'GET') {
        requireReplyPermission(access);
        if (!originAllowed(req.get('origin') ?? ''))
          throw new FeedbackReplyError(403, 'Origin not allowed.');
      }
      actors.set(req, { id: id.data, actor });
      next();
    } catch (error) {
      next(error);
    }
  });
  const posting = limiter({
    windowMs: 60_000,
    limit: 3,
    keyGenerator: (req) => {
      const actor = actors.get(req)?.actor;
      return actor?.kind === 'visitor' ? actor.visitorId : 'local-admin';
    },
  });
  router.get('/', async (req, res, next) => {
    const context = actors.get(req);
    if (!context) {
      next(new Error('Reply access was not initialized.'));
      return;
    }
    const query = z.strictObject({ cursor: z.uuid().optional() }).safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: 'Invalid reply cursor.' });
      return;
    }
    try {
      res.json(await listReplies(context.id, context.actor, query.data.cursor));
    } catch (error) {
      next(error);
    }
  });
  router.post('/', posting, json({ limit: '8kb', inflate: false }), async (req, res, next) => {
    const context = actors.get(req);
    if (!context) {
      next(new Error('Reply access was not initialized.'));
      return;
    }
    const input = CreateFeedbackReplySchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        message: input.error.issues[0]?.message ?? 'Invalid reply.',
      });
      return;
    }
    try {
      res.status(201).json(await createReply(context.id, context.actor, input.data.body));
    } catch (error) {
      next(error);
    }
  });
  router.post('/read', json({ limit: '2kb', inflate: false }), async (req, res, next) => {
    const context = actors.get(req);
    if (!context) {
      next(new Error('Reply access was not initialized.'));
      return;
    }
    const input = ReadFeedbackRepliesSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ message: 'Invalid read receipt.' });
      return;
    }
    try {
      res.json(await markRepliesRead(context.id, context.actor, input.data.ids));
    } catch (error) {
      next(error);
    }
  });
  router.use((error: unknown, _req: Request, res: Response, next: (error: unknown) => void) => {
    if (error instanceof FeedbackReplyError || error instanceof AbuseLimitError) {
      res
        .status(error instanceof FeedbackReplyError ? error.status : 429)
        .json({ message: error.message });
      return;
    }
    next(error);
  });
  return router;
}
