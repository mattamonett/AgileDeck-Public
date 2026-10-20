import { Injectable } from '@angular/core';
import {
  CreateFeedbackSchema,
  FeedbackPageSchema,
  FeedbackVoteStateSchema,
  OwnFeedbackItemSchema,
  OwnFeedbackPageSchema,
  type FeedbackCategory,
  type FeedbackPage,
  type FeedbackReaction,
  type FeedbackSort,
  type FeedbackVoteState,
  type OwnFeedbackItem,
} from '@poker/shared';
import { resolveApiUrl } from '@core/api/api-url';
import { apiErrorMessage } from '@core/api/api-request';

export type OwnFeedbackPage = ReturnType<typeof OwnFeedbackPageSchema.parse>;
export type CreateFeedback = ReturnType<typeof CreateFeedbackSchema.parse>;

export interface FeedbackListQuery {
  readonly category: FeedbackCategory;
  readonly sort: FeedbackSort;
  readonly includeClosed: boolean;
  readonly cursor: string | null;
}

const GENERIC_ERROR = 'The request could not be completed. Please try again.';

/** The API's own error message when it sent one, otherwise a generic retry hint. */
export async function responseMessage(response: Response): Promise<string> {
  try {
    return apiErrorMessage(await response.json()) ?? GENERIC_ERROR;
  } catch {
    // Use a generic message when a response has no JSON body.
    return GENERIC_ERROR;
  }
}

/** Public feedback board requests made with the visitor's session cookie. */
@Injectable({ providedIn: 'root' })
export class FeedbackApiService {
  readonly apiUrl = resolveApiUrl();

  async list(query: FeedbackListQuery): Promise<FeedbackPage> {
    const params = new URLSearchParams({
      category: query.category,
      sort: query.sort,
      includeClosed: String(query.includeClosed),
    });
    if (query.cursor) params.set('cursor', query.cursor);
    return FeedbackPageSchema.parse(
      await this.request('/api/feedback?' + params.toString(), { cache: 'no-store' }),
    );
  }

  async listOwn(cursor: string | null): Promise<OwnFeedbackPage> {
    const suffix = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    return OwnFeedbackPageSchema.parse(
      await this.request('/api/feedback/mine' + suffix, { cache: 'no-store' }),
    );
  }

  /** A null reaction removes the visitor's current vote. */
  async vote(id: string, reaction: FeedbackReaction | null): Promise<FeedbackVoteState> {
    return FeedbackVoteStateSchema.parse(
      await this.request('/api/feedback/' + id + '/vote', {
        method: reaction === null ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        ...(reaction === null ? {} : { body: JSON.stringify({ reaction }) }),
      }),
    );
  }

  async submit(feedback: CreateFeedback): Promise<OwnFeedbackItem> {
    return OwnFeedbackItemSchema.parse(
      await this.request('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      }),
    );
  }

  /** Best effort: the response is ignored and unseen items are simply flagged again later. */
  async markOwnSeen(ids: readonly string[]): Promise<void> {
    await fetch(this.apiUrl + '/api/feedback/mine/seen', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(this.apiUrl + path, { ...init, credentials: 'include' });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response.json();
  }
}
