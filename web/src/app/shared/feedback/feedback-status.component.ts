import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type {
  FeedbackWorkflow,
  FeedbackWorkflowStatus,
  FeedbackResolutionReason,
  FeedbackSubmissionStatus,
  OwnFeedbackItem,
} from '@poker/shared';

/** The author's private view of whether an admin has published their submission. */
export type SubmissionReview = Pick<OwnFeedbackItem, 'status' | 'rejectionReason'>;

@Component({
  selector: 'app-feedback-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="badges" aria-label="Feedback status">
      @if (submission(); as review) {
        <span
          class="submission"
          [class.pending]="review.status === 'pending'"
          [class.rejected]="review.status === 'rejected'"
          [title]="submissionDescriptions[review.status]"
        >
          {{ submissionLabels[review.status] }}
        </span>
      }
      <span
        class="workflow"
        [class.review]="item().workflowStatus === 'under_review'"
        [class.closed]="item().workflowStatus === 'closed'"
        [title]="workflowDescriptions[item().workflowStatus]"
      >
        {{ workflowLabels[item().workflowStatus] }}
      </span>
      @if (item().resolutionReason; as reason) {
        <span class="resolution">{{ resolutionLabels[reason] }}</span>
      }
    </div>
    @if (submission(); as review) {
      @switch (review.status) {
        @case ('pending') {
          <p class="review-note">
            Waiting for review. Only you can see this until an admin approves it.
          </p>
        }
        @case ('rejected') {
          <p class="review-note">
            Not approved. Only you can see this.
            @if (review.rejectionReason; as reason) {
              <span class="reason">Reason: {{ reason }}</span>
            }
          </p>
        }
      }
    }
    @if (item().resolutionNote; as note) {
      <p class="note">{{ note }}</p>
    }
    @if (item().duplicateOfId; as id) {
      <p class="reference">Duplicate of feedback {{ id }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 0.9rem;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
    }
    .workflow,
    .resolution,
    .submission {
      border: 1px solid #739088;
      border-radius: 999px;
      padding: 0.25rem 0.65rem;
    }
    .workflow {
      background: #17332f;
      color: #edf3ed;
      font-weight: 700;
    }
    .workflow.review {
      background: #4b5134;
      border-color: #dfc981;
    }
    .workflow.closed {
      background: #21583d;
    }
    .resolution {
      color: #f2e2b6;
      border-color: #dbcb9b;
    }
    .submission {
      color: #d6eadf;
      border-color: #8ebba0;
    }
    .submission.pending {
      background: #4b3f24;
      border-color: #dfc981;
      color: #f2e2b6;
    }
    .submission.rejected {
      background: #4d2626;
      border-color: #d48a7d;
      color: #f6d4cd;
    }
    .reference,
    .review-note {
      color: #cbd7d1;
    }
    .review-note {
      margin: 0.65rem 0 0;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    .reason {
      display: block;
      margin-top: 0.25rem;
      color: #edf3ed;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .note {
      margin: 0.65rem 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }
    .reference {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
  `,
})
export class FeedbackStatusComponent {
  readonly item = input.required<FeedbackWorkflow>();
  /** Only the author's own view passes this; public items are always published. */
  readonly submission = input<SubmissionReview | null>(null);
  readonly submissionLabels: Record<FeedbackSubmissionStatus, string> = {
    pending: 'Waiting for review',
    published: 'Published',
    rejected: 'Not approved',
  };
  readonly submissionDescriptions: Record<FeedbackSubmissionStatus, string> = {
    pending: 'An admin approves new feedback before others can see it.',
    published: 'Approved and visible to approved room members.',
    rejected: 'An admin did not approve this. It stays private.',
  };
  readonly workflowLabels: Record<FeedbackWorkflowStatus, string> = {
    new: 'New',
    under_review: 'Under Review',
    closed: 'Closed',
  };
  readonly workflowDescriptions: Record<FeedbackWorkflowStatus, string> = {
    new: 'Awaiting human review.',
    under_review: 'A human is looking into this feedback.',
    closed: 'Review is complete. See the resolution reason.',
  };
  readonly resolutionLabels: Record<FeedbackResolutionReason, string> = {
    implemented: 'Implemented',
    fixed: 'Fixed',
    duplicate: 'Duplicate',
    not_planned: 'Not Planned',
    unable_to_reproduce: 'Unable to Reproduce',
  };
}
