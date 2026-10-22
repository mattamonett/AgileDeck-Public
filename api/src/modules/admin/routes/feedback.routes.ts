import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import {
  FeedbackCategorySchema,
  FeedbackIncludeClosedSchema,
  FeedbackSubmissionStatusSchema,
  FeedbackWorkflowStatusSchema,
  UpdateFeedbackWorkflowSchema,
} from '@poker/shared';
import { jsonBody, JsonBodyLimit } from '../../../platform/http/json-body';
import { createFeedbackRepliesRouter } from '../../feedback/feedback-replies.routes';
import {
  findAdminFeedback,
  listAdminFeedback,
  updateFeedbackWorkflow,
} from '../feedback-admin.service';

const QuerySchema = z.strictObject({
  category: FeedbackCategorySchema.optional(),
  workflowStatus: FeedbackWorkflowStatusSchema.optional(),
  status: FeedbackSubmissionStatusSchema.optional(),
  includeClosed: FeedbackIncludeClosedSchema,
  cursor: z.uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

function feedbackFilter(query: z.infer<typeof QuerySchema>): Prisma.FeedbackWhereInput {
  const { search, category, workflowStatus, status, includeClosed } = query;
  const workflowFilter: Prisma.FeedbackWhereInput =
    workflowStatus !== undefined
      ? { workflowStatus }
      : includeClosed
        ? {}
        : { workflowStatus: { not: 'closed' } };
  return {
    ...(category === undefined ? {} : { category }),
    ...workflowFilter,
    ...(status === undefined ? {} : { status }),
    ...(search ? { title: { contains: search } } : {}),
  };
}

export function createAdminFeedbackRouter(isAdminOrigin: (origin: string) => boolean): Router {
  const router = Router();
  router.use(
    '/feedback/:id/replies',
    createFeedbackRepliesRouter(() => ({ kind: 'admin', network: 'local-admin' }), isAdminOrigin),
  );
  router.get('/feedback', async (req, res, next) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid feedback filters.' });
      return;
    }
    try {
      res.json(await listAdminFeedback(feedbackFilter(parsed.data), parsed.data.cursor));
    } catch (error) {
      next(error);
    }
  });
  router.get('/feedback/:id', async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ message: 'Invalid feedback reference.' });
      return;
    }
    try {
      res.json(await findAdminFeedback(id.data));
    } catch (error) {
      next(error);
    }
  });
  router.patch('/feedback/:id', jsonBody(JsonBodyLimit.MESSAGE), async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id);
    const change = UpdateFeedbackWorkflowSchema.safeParse(req.body);
    if (!id.success || !change.success) {
      res.status(400).json({
        message: change.success
          ? 'Invalid feedback reference.'
          : (change.error.issues[0]?.message ?? 'Invalid workflow change.'),
      });
      return;
    }
    try {
      res.json(await updateFeedbackWorkflow(id.data, change.data));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
