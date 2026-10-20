import { Router, json, type Response } from 'express';
import { z } from 'zod';
import { AbuseLimitError } from '../../platform/db/abuse-quota';
import { WindowBudget } from '../../platform/concurrency/window-budget';
import {
  CreateFeedbackSchema,
  FeedbackCategorySchema,
  FeedbackVoteInputSchema,
  FeedbackSortSchema,
  FeedbackIncludeClosedSchema,
  SeenFeedbackStatusSchema,
  type FeedbackCategory,
} from '@poker/shared';
import { createFeedbackRepliesRouter } from './feedback-replies.routes';
import { FeedbackError } from './feedback-errors';
import * as feedbackService from './feedback.service';
import { httpClientKey } from '../../platform/http/client-ip';
import {
  limiter,
  requireAllowedOrigin,
  requireVisitor,
  respondError,
} from '../../platform/http/helpers';
import { responseLocal } from '../../platform/http/response-local';
import { getSiteConfig } from '../../config/site-config';
import { acceptsCurrentAgreement } from '../site/site-agreement';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NETWORK_VOTES_PER_MINUTE = 60;

const PageCursorSchema = z.uuid().optional();

const feedbackVisitor = responseLocal<string>(
  () => new Error('Feedback session was not initialized.'),
);
const feedbackSubmission = responseLocal<feedbackService.FeedbackSubmission>(
  () => new Error('Feedback input was not parsed.'),
);

function getVisitorId(res: Response): string {
  return feedbackVisitor.get(res);
}

export function createFeedbackRouter(isOriginAllowed: (origin: string) => boolean) {
  const router = Router();
  const networkVotes = new WindowBudget(NETWORK_VOTES_PER_MINUTE, MINUTE_MS);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Checked per request so tests can switch it; the operator's file loads once.
    if (!getSiteConfig().features.feedback) {
      res.status(404).json({ message: 'Feedback is not available on this site.' });
      return;
    }
    next();
  });
  router.use(async (req, res, next) => {
    try {
      const visitorId = requireVisitor(req, res);
      if (!visitorId) return;
      if (!(await feedbackService.hasFeedbackAccess(visitorId))) {
        res.status(403).json({ message: 'Room approval is required to use feedback.' });
        return;
      }
      feedbackVisitor.set(res, visitorId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/access', (_req, res) => {
    res.json({ allowed: true });
  });
  router.use(
    '/:id/replies',
    createFeedbackRepliesRouter(
      (req, res) => ({
        kind: 'visitor',
        visitorId: getVisitorId(res),
        network: httpClientKey(req),
      }),
      isOriginAllowed,
    ),
  );
  router.use(json({ limit: '4kb', inflate: false }));

  router.get('/mine', async (req, res) => {
    try {
      const cursor = PageCursorSchema.safeParse(req.query.cursor);
      if (!cursor.success) {
        res.status(400).json({ message: 'Invalid page cursor.' });
        return;
      }
      res.json(await feedbackService.listOwnFeedback(getVisitorId(res), cursor.data));
    } catch (error) {
      respondFailure(res, error);
    }
  });

  // Drives the quiet dot on the room's feedback button.
  router.get('/mine/updates', async (_req, res) => {
    try {
      res.json({
        hasUpdates: await feedbackService.hasFeedbackUpdates(getVisitorId(res)),
      });
    } catch (error) {
      respondFailure(res, error);
    }
  });

  router.post('/mine/seen', async (req, res) => {
    try {
      if (!requireAllowedOrigin(req, res, isOriginAllowed)) return;
      const parsed = SeenFeedbackStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: 'Invalid read receipt.' });
        return;
      }
      await feedbackService.markStatusUpdatesSeen(getVisitorId(res), parsed.data.ids);
      res.status(204).end();
    } catch (error) {
      respondFailure(res, error);
    }
  });

  router.get('/', async (req, res) => {
    try {
      const rawCategory = req.query.category;
      let category: FeedbackCategory | undefined;
      if (rawCategory !== undefined) {
        const parsed = FeedbackCategorySchema.safeParse(rawCategory);
        if (!parsed.success) {
          res.status(400).json({ message: 'Invalid feedback type.' });
          return;
        }
        category = parsed.data;
      }
      const parsedSort = FeedbackSortSchema.safeParse(req.query.sort ?? 'newest');
      if (!parsedSort.success) {
        res.status(400).json({ message: 'Invalid feedback sort.' });
        return;
      }
      const parsedClosed = FeedbackIncludeClosedSchema.safeParse(req.query.includeClosed);
      if (!parsedClosed.success) {
        res.status(400).json({ message: 'Invalid closed feedback filter.' });
        return;
      }
      const sort = parsedSort.data;
      if (sort === 'top' && category === undefined) {
        res.status(400).json({ message: 'A feedback type is required for top sorting.' });
        return;
      }
      const cursor = PageCursorSchema.safeParse(req.query.cursor);
      if (!cursor.success) {
        res.status(400).json({ message: 'Invalid page cursor.' });
        return;
      }
      res.json(
        await feedbackService.listPublishedFeedback(getVisitorId(res), {
          category,
          sort,
          includeClosed: parsedClosed.data,
          cursor: cursor.data,
        }),
      );
    } catch (error) {
      respondFailure(res, error);
    }
  });

  const voteLimiter = limiter({
    windowMs: 60_000,
    limit: 30,
    keyGenerator: (_req, res) => getVisitorId(res),
  });

  router.put('/:id/vote', voteLimiter, async (req, res) => {
    try {
      if (!requireAllowedOrigin(req, res, isOriginAllowed)) return;
      const id = z.uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ message: 'Invalid feedback item.' });
        return;
      }
      const parsed = FeedbackVoteInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: 'Invalid vote.' });
        return;
      }
      res.json(
        await feedbackService.voteOnFeedback(
          id.data,
          {
            visitorId: getVisitorId(res),
            network: httpClientKey(req),
            networkVotes,
          },
          parsed.data.reaction,
        ),
      );
    } catch (error) {
      respondFailure(res, error);
    }
  });

  router.delete('/:id/vote', voteLimiter, async (req, res) => {
    try {
      if (!requireAllowedOrigin(req, res, isOriginAllowed)) return;
      const id = z.uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ message: 'Invalid feedback item.' });
        return;
      }
      res.json(
        await feedbackService.removeFeedbackVote(id.data, {
          visitorId: getVisitorId(res),
          network: httpClientKey(req),
          networkVotes,
        }),
      );
    } catch (error) {
      respondFailure(res, error);
    }
  });

  const minuteLimiter = limiter({
    windowMs: 60_000,
    limit: 1,
    keyGenerator: (_req, res) => getVisitorId(res),
    message: { message: 'Please wait a minute before posting again.' },
  });
  // Fast in-memory copies of the durable daily quotas, so floods stop before the database.
  const dailyLimiter = limiter({
    windowMs: DAY_MS,
    limit: () => getSiteConfig().limits.daily.feedbackPosts.perVisitor,
    keyGenerator: (_req, res) => getVisitorId(res),
    message: { message: 'Daily feedback limit reached. Please try tomorrow.' },
  });

  const ipLimiter = limiter({
    windowMs: DAY_MS,
    limit: () => getSiteConfig().limits.daily.feedbackPosts.perNetwork,
    keyGenerator: httpClientKey,
    message: { message: 'Too many feedback submissions from this network.' },
  });

  router.post(
    '/',
    (req, res, next) => {
      if (!requireAllowedOrigin(req, res, isOriginAllowed)) return;
      const parsed = CreateFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: parsed.error.issues[0]?.message ?? 'Invalid feedback.',
        });
        return;
      }
      if (
        !acceptsCurrentAgreement({
          version: parsed.data.agreementVersion,
          accepted: parsed.data.agreementAccepted,
        })
      ) {
        res.status(400).json({
          message:
            'The site terms have changed. Please read and accept them before submitting feedback.',
        });
        return;
      }
      feedbackSubmission.set(res, parsed.data);
      next();
    },
    minuteLimiter,
    dailyLimiter,
    ipLimiter,
    async (req, res) => {
      try {
        res
          .status(201)
          .json(
            await feedbackService.submitFeedback(
              getVisitorId(res),
              httpClientKey(req),
              feedbackSubmission.get(res),
            ),
          );
      } catch (error) {
        respondFailure(res, error);
      }
    },
  );
  return router;
}

function respondFailure(res: Response, error: unknown): void {
  respondError(res, error, {
    knownStatus: (cause) => {
      if (cause instanceof FeedbackError) return cause.status;
      return cause instanceof AbuseLimitError ? 429 : null;
    },
    logPrefix: 'Feedback request failed:',
    fallbackMessage: 'Could not complete the feedback request.',
  });
}
