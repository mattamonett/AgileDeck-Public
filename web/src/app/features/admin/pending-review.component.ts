import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import {
  AdminPendingReviewSchema,
  FeedbackReplySchema,
  OwnFeedbackItemSchema,
  RejectFeedbackSubmissionSchema,
  type AdminPendingReview,
  type FeedbackCategory,
  type FeedbackSubmissionStatus,
  type RejectFeedbackSubmission,
} from '@poker/shared';
import { ReviewDecisionComponent } from './review-decision.component';
import { AdminSessionService } from './admin-session.service';

/** What is being reviewed: a new feedback item or an author's reply. */
export type PendingKind = 'feedback' | 'replies';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: 'General feedback',
  bug: 'Bug',
  feature_request: 'Feature request',
  new_character_request: 'New character request',
};

const STATUS_LABELS: Record<FeedbackSubmissionStatus, string> = {
  pending: 'Waiting for review',
  published: 'Published',
  rejected: 'Rejected',
};

/** The manual review queue: every new item and author reply stays private until approved here. */
@Component({
  selector: 'app-pending-review',
  imports: [ReviewDecisionComponent],
  templateUrl: './pending-review.component.html',
  styleUrls: ['./admin-shared.css', './pending-review.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingReviewComponent {
  private readonly session = inject(AdminSessionService);
  /** The total still waiting, for the tab label. */
  readonly pendingCount = output<number>();
  /** Fires after an approval or rejection so other views can refresh. */
  readonly reviewed = output<void>();
  readonly review = signal<AdminPendingReview | null>(null);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly categoryLabels = CATEGORY_LABELS;
  readonly statusLabels = STATUS_LABELS;
  private generation = 0;

  constructor() {
    void this.load();
  }

  private async request(url: string, init: RequestInit = {}): Promise<unknown> {
    return this.session.request(url, 'Could not complete the review request.', {
      ...init,
      cache: 'no-store',
    });
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const review = AdminPendingReviewSchema.parse(await this.request('/pending'));
      if (generation !== this.generation) return;
      this.review.set(review);
      this.pendingCount.emit(review.feedbackCount + review.replyCount);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Could not load pending review.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  approve(kind: PendingKind, id: string): Promise<void> {
    return this.decide(kind, id, null);
  }

  reject(kind: PendingKind, id: string, reason: string): Promise<void> {
    const input = RejectFeedbackSubmissionSchema.safeParse({ reason });
    if (!input.success) {
      this.success.set('');
      this.error.set(input.error.issues[0]?.message ?? 'Check the rejection reason.');
      return Promise.resolve();
    }
    return this.decide(kind, id, input.data);
  }

  private async decide(
    kind: PendingKind,
    id: string,
    rejection: RejectFeedbackSubmission | null,
  ): Promise<void> {
    if (this.busyId() !== null) return;
    this.busyId.set(id);
    this.error.set('');
    this.success.set('');
    let failure = '';
    try {
      const data = await this.request(
        '/' + kind + '/' + encodeURIComponent(id) + (rejection ? '/reject' : '/approve'),
        rejection
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: rejection.reason ?? '' }),
            }
          : { method: 'POST' },
      );
      const status =
        kind === 'feedback'
          ? OwnFeedbackItemSchema.parse(data).status
          : FeedbackReplySchema.parse(data).status;
      this.success.set(
        (kind === 'feedback' ? 'Feedback ' : 'Reply ') +
          (status === 'published' ? 'approved and published.' : 'rejected.'),
      );
      this.reviewed.emit();
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Could not save the review.';
    } finally {
      this.busyId.set(null);
    }
    // Reload either way: a conflict means another tab already reviewed it.
    await this.load();
    if (failure) this.error.set(failure);
  }
}
