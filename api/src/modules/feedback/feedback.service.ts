import {
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_REACTIONS,
  FeedbackCategorySchema,
  type FeedbackCategory,
  type FeedbackReaction,
  type FeedbackSort,
} from '@poker/shared';
import type { Feedback } from '@prisma/client';
import type { WindowBudget } from '../../platform/concurrency/window-budget';
import { FeedbackError } from './feedback-errors';
import {
  hasUnreadAuthorReplies,
  unreadFeedbackIds,
  visibleReplyCounts,
} from './feedback-reply.repository';
import * as feedbackRepository from './feedback.repository';
import {
  DOWN_REACTIONS,
  TOP_REACTIONS,
  categoryCounts,
  feedbackWorkflow,
  ownFeedbackItem,
  voteStates,
  type VoteState,
} from './feedback.presenter';

/** Who is voting, and the per-network budget their votes draw from. */
export interface Voter {
  readonly visitorId: string;
  readonly network: string;
  readonly networkVotes: WindowBudget;
}

export interface PublishedFeedbackQuery {
  readonly category: FeedbackCategory | undefined;
  readonly sort: FeedbackSort;
  readonly includeClosed: boolean;
  readonly cursor: string | undefined;
}

const INVALID_CURSOR = 'Invalid page cursor.';
const NOT_FOUND = 'Feedback item not found.';

export type { FeedbackSubmission } from './feedback.repository';
export const hasFeedbackAccess = feedbackRepository.hasFeedbackAccess;

function nextCursor(entries: Feedback[], visible: Feedback[]): string | null {
  return entries.length > FEEDBACK_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null;
}

async function loadVoteStates(
  feedbackIds: string[],
  visitorId: string,
): Promise<Map<string, VoteState>> {
  if (feedbackIds.length === 0) return voteStates([], { counts: [], own: [] });
  return voteStates(feedbackIds, await feedbackRepository.findVoteRows(feedbackIds, visitorId));
}

export async function listOwnFeedback(visitorId: string, cursor: string | undefined) {
  if (cursor !== undefined && !(await feedbackRepository.isOwnFeedback(cursor, visitorId)))
    throw new FeedbackError(400, INVALID_CURSOR);
  const entries = await feedbackRepository.listOwnFeedback(visitorId, cursor ?? null);
  const visible = entries.slice(0, FEEDBACK_PAGE_SIZE);
  const ids = visible.map((entry) => entry.id);
  const replyCounts = await visibleReplyCounts(ids, visitorId);
  const unread = await unreadFeedbackIds(ids, 'author');
  return {
    items: visible.map((entry) => ({
      ...ownFeedbackItem(entry),
      hasUnreadReplies: unread.has(entry.id),
      hasStatusUpdate: entry.authorStatusUnread,
      replyCount: replyCounts.get(entry.id) ?? 0,
    })),
    nextCursor: nextCursor(entries, visible),
  };
}

/** Admin reviews, workflow changes and admin replies all count as updates. */
export async function hasFeedbackUpdates(visitorId: string): Promise<boolean> {
  return (
    (await feedbackRepository.hasUnseenStatusUpdate(visitorId)) ||
    (await hasUnreadAuthorReplies(visitorId))
  );
}

export const markStatusUpdatesSeen = feedbackRepository.markStatusUpdatesSeen;

async function requireCursorInList(
  cursor: string,
  category: FeedbackCategory | undefined,
  includeClosed: boolean,
): Promise<void> {
  const found = await feedbackRepository.findPublishedCategory(cursor, includeClosed);
  if (!found || (category !== undefined && found.category !== category))
    throw new FeedbackError(400, INVALID_CURSOR);
}

function listPage(query: PublishedFeedbackQuery): Promise<Feedback[]> {
  const { category, includeClosed } = query;
  const cursor = query.cursor ?? null;
  return query.sort === 'top' && category !== undefined
    ? feedbackRepository.listTopFeedback(
        category,
        TOP_REACTIONS[category],
        DOWN_REACTIONS[category],
        cursor,
        includeClosed,
      )
    : feedbackRepository.listPublishedFeedback(category, includeClosed, cursor);
}

export async function listPublishedFeedback(visitorId: string, query: PublishedFeedbackQuery) {
  if (query.cursor !== undefined)
    await requireCursorInList(query.cursor, query.category, query.includeClosed);
  const [entries, groups] = await Promise.all([
    listPage(query),
    feedbackRepository.countPublishedByCategory(query.includeClosed),
  ]);
  const visible = entries.slice(0, FEEDBACK_PAGE_SIZE);
  const ids = visible.map((entry) => entry.id);
  const replyCounts = await visibleReplyCounts(ids, visitorId);
  const votes = await loadVoteStates(ids, visitorId);
  const unread = await unreadFeedbackIds(
    visible.filter((entry) => entry.visitorId === visitorId).map((entry) => entry.id),
    'author',
  );
  return {
    counts: categoryCounts(groups),
    items: visible.map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      body: entry.body,
      createdAt: entry.createdAt.toISOString(),
      isOwn: entry.visitorId === visitorId,
      hasUnreadReplies: unread.has(entry.id),
      replyCount: replyCounts.get(entry.id) ?? 0,
      ...feedbackWorkflow(entry),
      ...votes.get(entry.id),
    })),
    nextCursor: nextCursor(entries, visible),
  };
}

async function requirePublished(id: string): Promise<Feedback> {
  const entry = await feedbackRepository.findPublishedFeedback(id);
  if (!entry) throw new FeedbackError(404, NOT_FOUND);
  return entry;
}

function consumeNetworkVote(voter: Voter): void {
  if (!voter.networkVotes.consume(voter.network))
    throw new FeedbackError(429, 'Too many votes from this network.');
}

export async function voteOnFeedback(
  id: string,
  voter: Voter,
  reaction: FeedbackReaction,
): Promise<VoteState | undefined> {
  const entry = await requirePublished(id);
  if (entry.visitorId === voter.visitorId)
    throw new FeedbackError(403, 'You cannot vote on your own feedback.');
  const category = FeedbackCategorySchema.parse(entry.category);
  if (!FEEDBACK_REACTIONS[category].some((allowed) => allowed === reaction))
    throw new FeedbackError(400, 'This vote is not available for this feedback type.');
  consumeNetworkVote(voter);
  await feedbackRepository.saveVote(id, voter.visitorId, voter.network, reaction);
  return (await loadVoteStates([id], voter.visitorId)).get(id);
}

export async function removeFeedbackVote(id: string, voter: Voter): Promise<VoteState | undefined> {
  await requirePublished(id);
  consumeNetworkVote(voter);
  await feedbackRepository.removeVote(id, voter.visitorId, voter.network);
  return (await loadVoteStates([id], voter.visitorId)).get(id);
}

export async function submitFeedback(
  visitorId: string,
  network: string,
  input: feedbackRepository.FeedbackSubmission,
) {
  const entry = await feedbackRepository.createFeedback(visitorId, network, input);
  return ownFeedbackItem(entry);
}
