import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FEEDBACK_REJECTION_REASON_MAX } from '@poker/shared';

/** Approve or reject one pending submission, with an optional reason for its author. */
@Component({
  selector: 'app-review-decision',
  imports: [FormsModule],
  template: `
    <div class="decision">
      <label
        >Reason shown to the author
        <span class="meta">Optional · used only when rejecting</span>
        <textarea
          rows="2"
          [attr.maxlength]="reasonMax"
          [ngModel]="reason()"
          (ngModelChange)="reason.set($event)"
          [disabled]="disabled()"
        ></textarea>
      </label>
      <div class="actions">
        <button type="button" [disabled]="disabled()" (click)="approve.emit()">
          {{ saving() ? 'Saving…' : 'Approve' }}
        </button>
        <button
          type="button"
          class="danger"
          [disabled]="disabled()"
          (click)="reject.emit(reason())"
        >
          Reject
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./admin-shared.css', './pending-review.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewDecisionComponent {
  readonly disabled = input(false);
  readonly saving = input(false);
  readonly approve = output<void>();
  /** The raw reason text; the container validates it before sending. */
  readonly reject = output<string>();
  readonly reason = signal('');
  readonly reasonMax = FEEDBACK_REJECTION_REASON_MAX;
}
