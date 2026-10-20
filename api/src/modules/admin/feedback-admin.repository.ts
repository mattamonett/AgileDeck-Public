import {
  OwnFeedbackItemSchema,
  FEEDBACK_PAGE_SIZE,
  type UpdateFeedbackWorkflow,
} from '@poker/shared';
import { Prisma, type Feedback, type FeedbackReply } from '@prisma/client';
import prisma from '../../platform/db/prisma';
import { unreadFeedbackIds } from '../feedback/feedback-reply.repository';
import { AdminError } from './admin-errors';

/** The rows a workflow change refers to, read inside its transaction. */
export type WorkflowReferences = {
  entry: Feedback | null;
  original: Feedback | null;
  dependents: number;
};

export function adminFeedbackItem(entry: Feedback) {
  return OwnFeedbackItemSchema.parse({
    id: entry.id,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
    status: entry.status,
    rejectionReason: entry.rejectionReason,
    workflowStatus: entry.workflowStatus,
    resolutionReason: entry.resolutionReason,
    resolutionNote: entry.resolutionNote,
    duplicateOfId: entry.duplicateOfId,
  });
}

async function hasUnreadAuthorReplies(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const unread = await tx.feedbackReply.count({
    where: {
      feedbackId: id,
      status: 'published',
      author: 'author',
      adminReadAt: null,
    },
  });
  return unread > 0;
}

export async function findAdminFeedback(id: string) {
  const entry = await prisma.feedback.findUnique({ where: { id } });
  if (!entry) throw new AdminError(404, 'Feedback item not found.');
  return {
    ...adminFeedbackItem(entry),
    hasUnreadReplies: (await unreadFeedbackIds([id], 'admin')).has(id),
  };
}

export async function listAdminFeedback(
  where: Prisma.FeedbackWhereInput,
  cursor: string | undefined,
) {
  if (cursor && !(await prisma.feedback.findFirst({ where: { ...where, id: cursor } })))
    throw new AdminError(400, 'Invalid page cursor.');
  const entries = await prisma.feedback.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEEDBACK_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const visible = entries.slice(0, FEEDBACK_PAGE_SIZE);
  const unread = await unreadFeedbackIds(
    visible.map((entry) => entry.id),
    'admin',
  );
  return {
    items: visible.map((entry) => ({
      ...adminFeedbackItem(entry),
      hasUnreadReplies: unread.has(entry.id),
    })),
    nextCursor: entries.length > FEEDBACK_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null,
  };
}

function workflowChanged({ previous, next }: UpdateFeedbackWorkflow) {
  return (
    previous.workflowStatus !== next.workflowStatus ||
    previous.resolutionReason !== next.resolutionReason ||
    previous.resolutionNote !== next.resolutionNote ||
    previous.duplicateOfId !== next.duplicateOfId
  );
}

/** `validate` runs inside the transaction and throws to abort the change. */
export async function updateFeedbackWorkflow(
  id: string,
  change: UpdateFeedbackWorkflow,
  validate: (references: WorkflowReferences) => void,
) {
  return prisma.$transaction(
    async (tx) => {
      const entry = await tx.feedback.findUnique({ where: { id } });
      const originalId = change.next.duplicateOfId;
      const original =
        originalId === null ? null : await tx.feedback.findUnique({ where: { id: originalId } });
      const dependents =
        change.next.resolutionReason === 'duplicate'
          ? await tx.feedback.count({ where: { duplicateOfId: id } })
          : 0;
      validate({ entry, original, dependents });
      const updated = await tx.feedback.updateMany({
        where: { id, ...change.previous },
        data: {
          ...change.next,
          ...(workflowChanged(change) ? { authorStatusUnread: true } : {}),
        },
      });
      if (updated.count !== 1)
        throw new AdminError(409, 'This feedback changed in another tab. Reload it before saving.');
      const hasUnreadReplies = await hasUnreadAuthorReplies(tx, id);
      return {
        ...adminFeedbackItem(await tx.feedback.findUniqueOrThrow({ where: { id } })),
        hasUnreadReplies,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** An admin's decision on a pending item or author reply. */
export type ReviewDecision =
  { status: 'published' } | { status: 'rejected'; reason: string | null };

/** `missing` when no such row exists; `reviewed` when it is no longer pending. */
export type ReviewOutcome<T> =
  { kind: 'missing' } | { kind: 'reviewed' } | { kind: 'updated'; entry: T };

export type PendingReply = FeedbackReply & {
  feedback: Pick<Feedback, 'id' | 'category' | 'title' | 'status'>;
};

const OLDEST_FIRST = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
const PENDING_AUTHOR_REPLY = { status: 'pending', author: 'author' };

/** The oldest pending items and author replies, with the size of each queue. */
export async function listPendingReview(): Promise<{
  feedback: Feedback[];
  feedbackCount: number;
  replies: PendingReply[];
  replyCount: number;
}> {
  const [feedback, feedbackCount, replies, replyCount] = await prisma.$transaction([
    prisma.feedback.findMany({
      where: { status: 'pending' },
      orderBy: OLDEST_FIRST,
      take: FEEDBACK_PAGE_SIZE,
    }),
    prisma.feedback.count({ where: { status: 'pending' } }),
    prisma.feedbackReply.findMany({
      where: PENDING_AUTHOR_REPLY,
      orderBy: OLDEST_FIRST,
      take: FEEDBACK_PAGE_SIZE,
      include: {
        feedback: {
          select: { id: true, category: true, title: true, status: true },
        },
      },
    }),
    prisma.feedbackReply.count({ where: PENDING_AUTHOR_REPLY }),
  ]);
  return { feedback, feedbackCount, replies, replyCount };
}

function reviewData(decision: ReviewDecision) {
  return {
    status: decision.status,
    rejectionReason: decision.status === 'rejected' ? decision.reason : null,
  };
}

/**
 * Publishes or rejects a pending item and flags the change for its author.
 * The pending check and the write share one statement, so two admin tabs
 * cannot both review the same item.
 */
export function reviewFeedback(
  id: string,
  decision: ReviewDecision,
): Promise<ReviewOutcome<ReturnType<typeof adminFeedbackItem> & { hasUnreadReplies: boolean }>> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.feedback.updateMany({
      where: { id, status: 'pending' },
      data: { ...reviewData(decision), authorStatusUnread: true },
    });
    const entry = await tx.feedback.findUnique({ where: { id } });
    if (!entry) return { kind: 'missing' };
    if (updated.count !== 1) return { kind: 'reviewed' };
    return {
      kind: 'updated',
      entry: {
        ...adminFeedbackItem(entry),
        hasUnreadReplies: await hasUnreadAuthorReplies(tx, id),
      },
    };
  });
}

/** Publishes or rejects a pending author reply; admin replies are never pending. */
export function reviewReply(
  replyId: string,
  decision: ReviewDecision,
): Promise<ReviewOutcome<FeedbackReply>> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.feedbackReply.updateMany({
      where: { id: replyId, ...PENDING_AUTHOR_REPLY },
      data: reviewData(decision),
    });
    const entry = await tx.feedbackReply.findUnique({
      where: { id: replyId },
    });
    if (!entry) return { kind: 'missing' };
    if (updated.count !== 1) return { kind: 'reviewed' };
    return { kind: 'updated', entry };
  });
}
