import { FeedbackReplySchema, FEEDBACK_REPLY_PAGE_SIZE } from '@poker/shared';
import type { Feedback, FeedbackReply } from '@prisma/client';
import { FeedbackReplyError } from './feedback-errors';
import type { ReplyAccess, ReplyActor } from './reply-access';
import * as replyRepository from './feedback-reply.repository';

function replyAccess(parent: Feedback | null, actor: ReplyActor): ReplyAccess {
  if (!parent) throw new FeedbackReplyError(404, 'Feedback item not found.');
  if (actor.kind === 'admin') return { role: 'admin', canReply: true, privateView: true };
  if (parent.visitorId === actor.visitorId)
    return { role: 'author', canReply: true, privateView: true };
  if (parent.status !== 'published') throw new FeedbackReplyError(404, 'Feedback item not found.');
  return { role: 'reader', canReply: false, privateView: false };
}
export function requireReplyPermission(access: ReplyAccess): void {
  if (!access.canReply)
    throw new FeedbackReplyError(403, 'Only the feedback author and admin can reply.');
}
function replyingAccess(actor: ReplyActor) {
  return (parent: Feedback | null) => {
    const access = replyAccess(parent, actor);
    requireReplyPermission(access);
    return access;
  };
}
export function replyItem(entry: FeedbackReply, access: ReplyAccess) {
  return FeedbackReplySchema.parse({
    id: entry.id,
    feedbackId: entry.feedbackId,
    author: entry.author,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
    status: entry.status,
    rejectionReason: access.privateView ? entry.rejectionReason : null,
    isUnread:
      entry.status === 'published' &&
      ((access.role === 'admin' && entry.author === 'author' && entry.adminReadAt === null) ||
        (access.role === 'author' && entry.author === 'admin' && entry.authorReadAt === null)),
  });
}
export async function accessReplies(id: string, actor: ReplyActor) {
  return replyAccess(await replyRepository.findReplyParent(id), actor);
}
export async function listReplies(id: string, actor: ReplyActor, cursor: string | undefined) {
  const access = await accessReplies(id, actor);
  const page = await replyRepository.findReplyPage(id, !access.privateView, cursor);
  if (!page) throw new FeedbackReplyError(400, 'Invalid reply cursor.');
  const visible = page.entries.slice(0, FEEDBACK_REPLY_PAGE_SIZE);
  const unread =
    access.role === 'reader'
      ? new Set<string>()
      : await replyRepository.unreadFeedbackIds([id], access.role);
  return {
    totalCount: page.totalCount,
    items: visible.map((entry) => replyItem(entry, access)),
    nextCursor:
      page.entries.length > FEEDBACK_REPLY_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null,
    canReply: access.canReply,
    hasUnread: unread.has(id),
  };
}
export async function createReply(id: string, actor: ReplyActor, body: string) {
  const { entry, access } = await replyRepository.insertReply(
    id,
    actor,
    body,
    replyingAccess(actor),
  );
  return replyItem(entry, access);
}
export async function markRepliesRead(id: string, actor: ReplyActor, ids: string[]) {
  const access = await accessReplies(id, actor);
  requireReplyPermission(access);
  const role = access.role === 'admin' ? 'admin' : 'author';
  await replyRepository.markRepliesRead(id, ids, role);
  return {
    hasUnread: (await replyRepository.unreadFeedbackIds([id], role)).has(id),
  };
}
