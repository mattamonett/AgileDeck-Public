import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_REACTIONS,
  type FeedbackCategory,
  type FeedbackCounts,
  type FeedbackItem,
  type FeedbackReaction,
  type FeedbackSort,
  type OwnFeedbackItem,
} from '@poker/shared';
import { FeedbackUpdatesService } from '@shared/feedback/feedback-updates.service';
import { FeedbackApiService } from './feedback-api.service';
import { FEEDBACK_CATEGORY_LABELS, validateFeedbackDraft } from './feedback-form.model';
import { FeedbackFormComponent } from './feedback-form.component';
import { FeedbackRepliesComponent } from '@shared/feedback/feedback-replies.component';
import { FeedbackStatusComponent } from '@shared/feedback/feedback-status.component';
import { SiteConfigService } from '@core/config/site-config.service';

const EMPTY_COUNTS: FeedbackCounts = {
  general: 0,
  bug: 0,
  feature_request: 0,
  new_character_request: 0,
};

const REACTION_LABELS: Record<FeedbackReaction, string> = {
  agree: '👍 Agree',
  disagree: '👎 Disagree',
  seen_too: 'I’ve seen this too',
  would_use: 'I’d use this',
  not_for_me: 'Not for me',
  would_throw: 'I’d throw this',
};

@Component({
  selector: 'app-feedback',
  imports: [
    FormsModule,
    RouterLink,
    FeedbackStatusComponent,
    FeedbackRepliesComponent,
    FeedbackFormComponent,
  ],
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackComponent {
  private readonly api = inject(FeedbackApiService);
  readonly apiUrl = this.api.apiUrl;
  private readonly route = inject(ActivatedRoute);
  readonly feedbackUpdates = inject(FeedbackUpdatesService);
  private readonly siteConfig = inject(SiteConfigService);
  readonly siteName = this.siteConfig.siteName;
  readonly agreementRequired = this.siteConfig.agreementRequired;

  readonly categories = FEEDBACK_CATEGORIES;
  readonly labels = FEEDBACK_CATEGORY_LABELS;
  readonly reactions = FEEDBACK_REACTIONS;
  readonly reactionLabels = REACTION_LABELS;
  readonly returnRoom = this.route.snapshot.queryParamMap.get('from');
  readonly tab = signal<'read' | 'write' | 'mine'>('read');
  readonly category = signal<FeedbackCategory>('general');
  readonly viewCategory = signal<FeedbackCategory>('general');
  readonly showClosed = signal(false);
  readonly sort = signal<FeedbackSort>('newest');
  readonly counts = signal<FeedbackCounts>(EMPTY_COUNTS);
  readonly title = signal('');
  readonly body = signal('');
  readonly answers = signal<Readonly<Record<string, string>>>({});
  readonly agreementAccepted = signal(false);
  readonly items = signal<FeedbackItem[]>([]);
  readonly ownItems = signal<OwnFeedbackItem[]>([]);
  readonly ownNextCursor = signal<string | null>(null);
  readonly ownLoading = signal(false);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly hasLoaded = signal(false);
  readonly saving = signal(false);
  readonly votingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  private loadGeneration = 0;

  constructor() {
    void this.load();
    if (this.route.snapshot.queryParamMap.get('tab') === 'mine') this.switchTab('mine');
  }

  async load(more = false): Promise<void> {
    const cursor = more ? this.nextCursor() : null;
    if (more && (!cursor || this.loading())) return;
    const generation = ++this.loadGeneration;
    const category = this.viewCategory();
    this.loading.set(true);
    this.error.set('');
    if (!more) {
      this.items.set([]);
      this.nextCursor.set(null);
      this.hasLoaded.set(false);
    }
    try {
      const page = await this.api.list({
        category,
        sort: this.sort(),
        includeClosed: this.showClosed(),
        cursor,
      });
      if (generation !== this.loadGeneration) return;
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.nextCursor.set(page.nextCursor);
      this.counts.set(page.counts);
      this.hasLoaded.set(true);
    } catch (error) {
      if (generation === this.loadGeneration) {
        this.error.set(error instanceof Error ? error.message : 'Could not load feedback.');
      }
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }

  async loadOwn(more = false): Promise<void> {
    const cursor = more ? this.ownNextCursor() : null;
    if (more && (!cursor || this.ownLoading())) return;
    this.ownLoading.set(true);
    this.error.set('');
    try {
      const page = await this.api.listOwn(cursor);
      this.ownItems.set(more ? [...this.ownItems(), ...page.items] : page.items);
      this.ownNextCursor.set(page.nextCursor);
      void this.markStatusSeen(page.items);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load your submissions.');
    } finally {
      this.ownLoading.set(false);
    }
  }

  /** Items keep their "Updated" tag for this visit; the server stops counting them as news. */
  private async markStatusSeen(items: readonly OwnFeedbackItem[]): Promise<void> {
    const ids = items.filter((item) => item.hasStatusUpdate).map((item) => item.id);
    if (ids.length === 0) return;
    try {
      await this.api.markOwnSeen(ids);
    } catch {
      // The item is simply flagged again next time.
    }
    await this.feedbackUpdates.refresh();
  }

  selectViewCategory(category: FeedbackCategory): void {
    if (category === this.viewCategory()) return;
    this.viewCategory.set(category);
    void this.load();
  }

  toggleClosed(show: boolean): void {
    this.showClosed.set(show);
    void this.load();
  }

  selectSort(sort: FeedbackSort): void {
    if (sort === this.sort()) return;
    this.sort.set(sort);
    void this.load();
  }

  async vote(item: FeedbackItem, reaction: FeedbackReaction): Promise<void> {
    if (item.isOwn || this.votingId() !== null) return;
    this.votingId.set(item.id);
    this.error.set('');
    try {
      const removing = item.userVote === reaction;
      const state = await this.api.vote(item.id, removing ? null : reaction);
      this.items.update((items) =>
        items.map((current) => (current.id === item.id ? { ...current, ...state } : current)),
      );
      if (this.sort() === 'top') await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save your vote.');
    } finally {
      this.votingId.set(null);
    }
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    this.success.set('');
    const submission = validateFeedbackDraft({
      category: this.category(),
      title: this.title(),
      body: this.body(),
      answers: this.answers(),
      agreementAccepted: this.agreementAccepted(),
      agreementVersion: this.agreementRequired()
        ? this.siteConfig.config().legal.agreementVersion
        : null,
    });
    if (!submission.ok) {
      this.error.set(submission.message);
      return;
    }
    this.saving.set(true);
    try {
      const submitted = await this.api.submit(submission.feedback);
      this.title.set('');
      this.body.set('');
      this.answers.set({});
      this.agreementAccepted.set(false);
      this.category.set('general');
      this.tab.set('mine');
      this.success.set(
        'Feedback submitted. It is waiting for review and will appear to others once an admin approves it.',
      );
      this.ownItems.update((items) => [submitted, ...items]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not submit feedback.');
    } finally {
      this.saving.set(false);
    }
  }

  repliesRead(id: string, hasUnreadReplies: boolean): void {
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, hasUnreadReplies } : item)),
    );
    this.ownItems.update((items) =>
      items.map((item) => (item.id === id ? { ...item, hasUnreadReplies } : item)),
    );
    if (!hasUnreadReplies) void this.feedbackUpdates.refresh();
  }

  switchTab(tab: 'read' | 'write' | 'mine'): void {
    this.tab.set(tab);
    this.error.set('');
    this.success.set('');
    if (tab === 'read' && !this.hasLoaded() && !this.loading()) void this.load();
    if (tab === 'mine') void this.loadOwn();
  }
}
