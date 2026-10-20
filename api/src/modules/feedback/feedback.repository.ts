import { Prisma, type Feedback } from '@prisma/client';
import {
  FEEDBACK_PAGE_SIZE,
  type CreateFeedbackSchema,
  type FeedbackCategory,
  type FeedbackReaction,
} from '@poker/shared';
import prisma from '../../platform/db/prisma';
import { consumeDailyQuotas } from '../../platform/db/abuse-quota';
import { getSiteConfig } from '../../config/site-config';
import { agreementRecord, requiredAgreement } from '../site/site-agreement';

export type VoteCountRow = {
  feedbackId: string;
  reaction: string;
  count: bigint;
};
export type OwnVoteRow = { feedbackId: string; reaction: string };
export type FeedbackSubmission = ReturnType<typeof CreateFeedbackSchema.parse>;

/** Closed items are hidden from public lists unless explicitly requested. */
function workflowFilter(includeClosed: boolean): Prisma.FeedbackWhereInput {
  return includeClosed ? {} : { workflowStatus: { not: 'closed' } };
}

export async function hasFeedbackAccess(visitorId: string): Promise<boolean> {
  return (await prisma.feedbackAccess.findUnique({ where: { visitorId } })) !== null;
}

export async function isOwnFeedback(id: string, visitorId: string): Promise<boolean> {
  return (await prisma.feedback.findFirst({ where: { id, visitorId } })) !== null;
}

/** Up to one more than a page, newest first, so callers can tell whether more remain. */
export function listOwnFeedback(visitorId: string, cursor: string | null): Promise<Feedback[]> {
  return prisma.feedback.findMany({
    where: { visitorId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEEDBACK_PAGE_SIZE + 1,
    ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
  });
}

/** Whether a human status change on any of the visitor's feedback is still unseen. */
export async function hasUnseenStatusUpdate(visitorId: string): Promise<boolean> {
  return (
    (await prisma.feedback.findFirst({
      where: { visitorId, authorStatusUnread: true },
      select: { id: true },
    })) !== null
  );
}

export async function markStatusUpdatesSeen(
  visitorId: string,
  ids: readonly string[],
): Promise<void> {
  await prisma.feedback.updateMany({
    where: { visitorId, id: { in: [...ids] }, authorStatusUnread: true },
    data: { authorStatusUnread: false },
  });
}

export function findPublishedCategory(
  id: string,
  includeClosed: boolean,
): Promise<{ category: string } | null> {
  return prisma.feedback.findFirst({
    where: { id, status: 'published', ...workflowFilter(includeClosed) },
    select: { category: true },
  });
}

/** Up to one more than a page, newest first. */
export function listPublishedFeedback(
  category: FeedbackCategory | undefined,
  includeClosed: boolean,
  cursor: string | null,
): Promise<Feedback[]> {
  return prisma.feedback.findMany({
    where: {
      status: 'published',
      ...workflowFilter(includeClosed),
      ...(category === undefined ? {} : { category }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEEDBACK_PAGE_SIZE + 1,
    ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
  });
}

export async function countPublishedByCategory(
  includeClosed: boolean,
): Promise<{ category: string; count: number }[]> {
  const groups = await prisma.feedback.groupBy({
    by: ['category'],
    where: { status: 'published', ...workflowFilter(includeClosed) },
    _count: { _all: true },
  });
  return groups.map((group) => ({
    category: group.category,
    count: group._count._all,
  }));
}

/**
 * Up to one more than a page of published items in a category, ranked by
 * positive minus negative votes, then newest first.
 */
export async function listTopFeedback(
  category: FeedbackCategory,
  positive: FeedbackReaction,
  negative: FeedbackReaction | null,
  cursor: string | null,
  includeClosed: boolean,
): Promise<Feedback[]> {
  const afterCursor = cursor
    ? Prisma.sql`WHERE (score, "createdAt", id) < (
        SELECT score, "createdAt", id FROM ranked WHERE id = ${cursor}
      )`
    : Prisma.empty;
  const ranked = await prisma.$queryRaw<{ id: string }[]>`
    WITH ranked AS (
      SELECT f.id, f."createdAt",
        SUM(CASE
          WHEN v.reaction = ${positive} THEN 1
          WHEN v.reaction = ${negative ?? ''} THEN -1
          ELSE 0
        END) AS score
      FROM "Feedback" f
      LEFT JOIN "FeedbackVote" v ON v."feedbackId" = f.id
      WHERE f.category = ${category} AND f.status = 'published'
      ${includeClosed ? Prisma.empty : Prisma.sql`AND f."workflowStatus" <> 'closed'`}
      GROUP BY f.id
    )
    SELECT id FROM ranked
    ${afterCursor}
    ORDER BY score DESC, "createdAt" DESC, id DESC
    LIMIT ${FEEDBACK_PAGE_SIZE + 1}
  `;
  const ids = ranked.map((row) => row.id);
  if (ids.length === 0) return [];
  const entries = await prisma.feedback.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

export function findPublishedFeedback(id: string): Promise<Feedback | null> {
  return prisma.feedback.findFirst({ where: { id, status: 'published' } });
}

export async function findVoteRows(
  feedbackIds: string[],
  visitorId: string,
): Promise<{ counts: VoteCountRow[]; own: OwnVoteRow[] }> {
  const [counts, own] = await Promise.all([
    prisma.$queryRaw<VoteCountRow[]>`
      SELECT "feedbackId", "reaction", COUNT(*) AS "count"
      FROM "FeedbackVote"
      WHERE "feedbackId" IN (${Prisma.join(feedbackIds)})
      GROUP BY "feedbackId", "reaction"
    `,
    prisma.$queryRaw<OwnVoteRow[]>`
      SELECT "feedbackId", "reaction"
      FROM "FeedbackVote"
      WHERE "feedbackId" IN (${Prisma.join(feedbackIds)}) AND "visitorId" = ${visitorId}
    `,
  ]);
  return { counts, own };
}

async function consumeVoteQuotas(tx: Prisma.TransactionClient, network: string, visitorId: string) {
  const quota = getSiteConfig().limits.daily.feedbackVotes;
  await consumeDailyQuotas(tx, [
    {
      scope: 'feedback-vote-network',
      identity: network,
      limit: quota.perNetwork,
    },
    {
      scope: 'feedback-vote-visitor',
      identity: visitorId,
      limit: quota.perVisitor,
    },
    { scope: 'feedback-vote-global', identity: 'all', limit: quota.perSite },
  ]);
}

/** Records or changes a vote, committing its daily quotas in the same transaction. */
export async function saveVote(
  id: string,
  visitorId: string,
  network: string,
  reaction: FeedbackReaction,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await consumeVoteQuotas(tx, network, visitorId);
    await tx.$executeRaw`
        INSERT INTO "FeedbackVote" ("feedbackId", "visitorId", "reaction")
        VALUES (${id}, ${visitorId}, ${reaction})
        ON CONFLICT ("feedbackId", "visitorId")
        DO UPDATE SET "reaction" = excluded."reaction"
      `;
  });
}

/** Removes a vote; removals spend the same daily quotas as votes. */
export async function removeVote(id: string, visitorId: string, network: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await consumeVoteQuotas(tx, network, visitorId);
    await tx.$executeRaw`
        DELETE FROM "FeedbackVote"
        WHERE "feedbackId" = ${id} AND "visitorId" = ${visitorId}
      `;
  });
}

/**
 * Stores a submission with its agreement record (when the site asks for one)
 * and daily quotas atomically.
 * It stays private to its author until an admin approves it.
 */
export function createFeedback(
  visitorId: string,
  network: string,
  input: FeedbackSubmission,
): Promise<Feedback> {
  return prisma.$transaction(async (tx) => {
    const quota = getSiteConfig().limits.daily.feedbackPosts;
    await consumeDailyQuotas(tx, [
      {
        scope: 'feedback-submit-visitor',
        identity: visitorId,
        limit: quota.perVisitor,
      },
      {
        scope: 'feedback-submit-network',
        identity: network,
        limit: quota.perNetwork,
      },
      {
        scope: 'feedback-submit-global',
        identity: 'all',
        limit: quota.perSite,
      },
    ]);
    const agreement = requiredAgreement();
    if (agreement) {
      await tx.feedbackAccess.update({
        where: { visitorId },
        data: agreementRecord(agreement),
      });
    }
    return tx.feedback.create({
      data: {
        visitorId,
        category: input.category,
        title: input.title,
        body: input.body,
        status: 'pending',
      },
    });
  });
}
