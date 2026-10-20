import { FEEDBACK_REPLY_PAGE_SIZE } from '@poker/shared';
import { Prisma, type Feedback, type FeedbackReply } from '@prisma/client';
import prisma from '../../platform/db/prisma';
import { AbuseLimitError, consumeDailyQuotas } from '../../platform/db/abuse-quota';
import { getSiteConfig } from '../../config/site-config';
import type { ReplyAccess, ReplyActor } from './reply-access';

const MAX_REPLIES_PER_FEEDBACK = 100;
const MAX_STORED_REPLIES = 100_000;

/** Authorizes against a parent read inside the same transaction; throws to abort. */
export type ReplyParentCheck = (parent: Feedback | null) => ReplyAccess;

export type AuthorizedReply = { access: ReplyAccess; entry: FeedbackReply };

export function findReplyParent(id: string): Promise<Feedback | null> {
  return prisma.feedback.findUnique({ where: { id } });
}
function unreadWhere(role: 'admin' | 'author'): Prisma.FeedbackReplyWhereInput {
  return {
    status: 'published',
    author: role === 'admin' ? 'author' : 'admin',
    ...(role === 'admin' ? { adminReadAt: null } : { authorReadAt: null }),
  };
}
export async function unreadFeedbackIds(
  ids: string[],
  role: 'admin' | 'author',
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const groups = await prisma.feedbackReply.groupBy({
    by: ['feedbackId'],
    where: { feedbackId: { in: ids }, ...unreadWhere(role) },
  });
  return new Set(groups.map((group) => group.feedbackId));
}
export async function hasUnreadAuthorReplies(visitorId: string) {
  const reply = await prisma.feedbackReply.findFirst({
    where: { feedback: { visitorId }, ...unreadWhere('author') },
    select: { id: true },
  });
  return reply !== null;
}
export async function visibleReplyCounts(ids: string[], visitorId: string) {
  if (ids.length === 0) return new Map<string, number>();
  const groups = await prisma.feedbackReply.groupBy({
    by: ['feedbackId'],
    where: {
      feedbackId: { in: ids },
      OR: [{ status: 'published' }, { feedback: { visitorId } }],
    },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.feedbackId, group._count._all]));
}
/** One page of a thread's replies, or null when the cursor is not in that thread. */
export async function findReplyPage(
  id: string,
  publishedOnly: boolean,
  cursor: string | undefined,
): Promise<{ entries: FeedbackReply[]; totalCount: number } | null> {
  const where = {
    feedbackId: id,
    ...(publishedOnly ? { status: 'published' } : {}),
  };
  if (cursor && !(await prisma.feedbackReply.findFirst({ where: { ...where, id: cursor } })))
    return null;
  const entries = await prisma.feedbackReply.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: FEEDBACK_REPLY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return { entries, totalCount: await prisma.feedbackReply.count({ where }) };
}
/** The admin's own reply budget; it is not an operator setting. */
const ADMIN_DAILY_REPLIES = 100;

async function consumeReplyQuota(tx: Prisma.TransactionClient, actor: ReplyActor) {
  const quota = getSiteConfig().limits.daily.feedbackReplies;
  const admin = actor.kind === 'admin';
  // Admin replies share the site-wide budget but keep their own fixed limits.
  await consumeDailyQuotas(tx, [
    { scope: 'feedback-reply-global', identity: 'all', limit: quota.perSite },
    {
      scope: 'feedback-reply-network',
      identity: actor.network,
      limit: admin ? ADMIN_DAILY_REPLIES : quota.perNetwork,
    },
    {
      scope: 'feedback-reply-sender',
      identity: admin ? 'local-admin' : actor.visitorId,
      limit: admin ? ADMIN_DAILY_REPLIES : quota.perVisitor,
    },
  ]);
}
export async function insertReply(
  id: string,
  actor: ReplyActor,
  body: string,
  authorize: ReplyParentCheck,
): Promise<AuthorizedReply> {
  return prisma.$transaction(async (tx) => {
    const access = authorize(await tx.feedback.findUnique({ where: { id } }));
    if (
      (await tx.feedbackReply.count({ where: { feedbackId: id } })) >= MAX_REPLIES_PER_FEEDBACK ||
      (await tx.feedbackReply.count()) >= MAX_STORED_REPLIES
    )
      throw new AbuseLimitError('The feedback reply storage limit has been reached.');
    await consumeReplyQuota(tx, actor);
    const entry = await tx.feedbackReply.create({
      data: {
        feedbackId: id,
        author: actor.kind === 'admin' ? 'admin' : 'author',
        body,
        // Admin replies need no review; author replies wait for an admin.
        status: actor.kind === 'admin' ? 'published' : 'pending',
      },
    });
    return { access, entry };
  });
}
export async function markRepliesRead(
  id: string,
  ids: string[],
  role: 'admin' | 'author',
): Promise<void> {
  await prisma.feedbackReply.updateMany({
    where: { feedbackId: id, id: { in: ids }, ...unreadWhere(role) },
    data: role === 'admin' ? { adminReadAt: new Date() } : { authorReadAt: new Date() },
  });
}
