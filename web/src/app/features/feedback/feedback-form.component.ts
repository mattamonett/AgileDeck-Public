import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_TITLE_MAX,
  type FeedbackCategory,
} from '@poker/shared';
import { SiteAgreementComponent } from '@shared/legal/site-agreement.component';
import { FEEDBACK_GUIDANCE } from './feedback-guidance';
import {
  answerKey,
  draftAnswer,
  feedbackBodyLength,
  formatFeedbackBody,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_FIELDS,
} from './feedback-form.model';

/** The compose form and writing guide; the page owns the draft so it survives tab switches. */
@Component({
  selector: 'app-feedback-form',
  imports: [FormsModule, SiteAgreementComponent],
  templateUrl: './feedback-form.component.html',
  styleUrl: './feedback-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackFormComponent {
  readonly category = model.required<FeedbackCategory>();
  readonly title = model.required<string>();
  readonly body = model.required<string>();
  readonly answers = model.required<Readonly<Record<string, string>>>();
  readonly agreementAccepted = model.required<boolean>();
  readonly saving = input(false);
  readonly agreementRequired = input(true);
  readonly submitted = output<void>();

  readonly categories = FEEDBACK_CATEGORIES;
  readonly labels = FEEDBACK_CATEGORY_LABELS;
  readonly guidance = FEEDBACK_GUIDANCE;
  readonly titleMax = FEEDBACK_TITLE_MAX;
  readonly bodyMax = FEEDBACK_BODY_MAX;
  readonly fields = computed(() => FEEDBACK_FIELDS[this.category()]);
  private readonly draftAnswers = computed(() => ({
    category: this.category(),
    body: this.body(),
    answers: this.answers(),
  }));
  readonly bodyLength = computed(() => feedbackBodyLength(formatFeedbackBody(this.draftAnswers())));

  answer(id: string): string {
    return draftAnswer(this.draftAnswers(), id);
  }

  setAnswer(id: string, value: string): void {
    const category = this.category();
    if (category === 'general') {
      this.body.set(value);
      return;
    }
    this.answers.update((answers) => ({ ...answers, [answerKey(category, id)]: value }));
  }
}
