import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { RejectFeedbackSubmissionSchema } from '@poker/shared';
import {
  listPendingReview,
  reviewFeedback,
  reviewReply,
  type ReviewDecision,
} from '../feedback-admin.service';

type ParsedDecision = { valid: true; decision: ReviewDecision } | { valid: false; message: string };

function approve(): ParsedDecision {
  return { valid: true, decision: { status: 'published' } };
}

function reject(req: express.Request): ParsedDecision {
  const input = RejectFeedbackSubmissionSchema.safeParse(req.body);
  return input.success
    ? {
        valid: true,
        decision: { status: 'rejected', reason: input.data.reason },
      }
    : {
        valid: false,
        message: input.error.issues[0]?.message ?? 'Invalid rejection reason.',
      };
}

function reviewRoute(
  kind: 'feedback' | 'replies',
  decide: (req: express.Request) => ParsedDecision,
): RequestHandler {
  return async function review(req, res, next) {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ message: 'Invalid review reference.' });
      return;
    }
    const parsed = decide(req);
    if (!parsed.valid) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    try {
      res.json(
        kind === 'feedback'
          ? await reviewFeedback(id.data, parsed.decision)
          : await reviewReply(id.data, parsed.decision),
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createReviewRouter(): Router {
  const router = Router();
  router.get('/pending', async (_req, res, next) => {
    try {
      res.json(await listPendingReview());
    } catch (error) {
      next(error);
    }
  });
  const reviewBody = express.json({ limit: '4kb', inflate: false });
  router.post('/feedback/:id/approve', reviewRoute('feedback', approve));
  router.post('/feedback/:id/reject', reviewBody, reviewRoute('feedback', reject));
  router.post('/replies/:id/approve', reviewRoute('replies', approve));
  router.post('/replies/:id/reject', reviewBody, reviewRoute('replies', reject));
  return router;
}
