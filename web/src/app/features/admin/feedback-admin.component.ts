import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiPath,
  OwnFeedbackItemSchema,
  OwnFeedbackPageSchema,
  FeedbackWorkflowSchema,
  UpdateFeedbackWorkflowSchema,
  FEEDBACK_CATEGORIES,
  FeedbackWorkflowStatusSchema,
  FeedbackResolutionReasonSchema,
  FeedbackSubmissionStatusSchema,
  type OwnFeedbackItem,
  type FeedbackWorkflow,
  type FeedbackWorkflowStatus,
  type FeedbackResolutionReason,
} from '@poker/shared';
import { SitePasswordFormComponent } from '@shared/access/site-password-form.component';
import { FeedbackRepliesComponent } from '@shared/feedback/feedback-replies.component';
import { FeedbackStatusComponent } from '@shared/feedback/feedback-status.component';
import { PendingReviewComponent } from './pending-review.component';
import { RoomAdminComponent } from './room-admin.component';
import { UsageAdminComponent } from './usage-admin.component';
import { resolveApiUrl } from '@core/api/api-url';
import { AdminSessionService } from './admin-session.service';
import { isPlainHttpBeyondThisComputer } from './plain-http';

function workflowOf(item: FeedbackWorkflow): FeedbackWorkflow {
  return {
    workflowStatus: item.workflowStatus,
    resolutionReason: item.resolutionReason,
    resolutionNote: item.resolutionNote,
    duplicateOfId: item.duplicateOfId,
  };
}

@Component({
  selector: 'app-feedback-admin',
  imports: [
    FormsModule,
    SitePasswordFormComponent,
    FeedbackStatusComponent,
    FeedbackRepliesComponent,
    PendingReviewComponent,
    RoomAdminComponent,
    UsageAdminComponent,
  ],
  templateUrl: './feedback-admin.component.html',
  styleUrl: './feedback-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackAdminComponent {
  readonly session = inject(AdminSessionService);
  readonly plainHttp = isPlainHttpBeyondThisComputer(inject(DOCUMENT).location);
  readonly repliesUrl = resolveApiUrl() + ApiPath.ADMIN;
  readonly checkPassword = (password: string) => this.session.signIn(password);
  readonly activeTab = signal<'pending' | 'feedback' | 'rooms' | 'usage'>('pending');
  readonly pendingCount = signal<number | null>(null);
  readonly categories = FEEDBACK_CATEGORIES;
  readonly statuses = FeedbackWorkflowStatusSchema.options;
  readonly reasons = FeedbackResolutionReasonSchema.options;
  readonly publicationStatuses = FeedbackSubmissionStatusSchema.options;
  readonly items = signal<OwnFeedbackItem[]>([]);
  readonly selected = signal<OwnFeedbackItem | null>(null);
  readonly original = signal<OwnFeedbackItem | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly category = signal('');
  readonly statusFilter = signal('');
  readonly showClosed = signal(false);
  readonly publicationFilter = signal('');
  readonly search = signal('');
  readonly workflowStatus = signal<FeedbackWorkflowStatus>('new');
  readonly reason = signal<FeedbackResolutionReason>('implemented');
  readonly note = signal('');
  readonly duplicateId = signal('');
  private generation = 0;
  readonly labels: Readonly<Record<string, string>> = {
    general: 'General feedback',
    bug: 'Bug',
    feature_request: 'Feature request',
    new_character_request: 'New character request',
    new: 'New',
    under_review: 'Under Review',
    closed: 'Closed',
    implemented: 'Implemented',
    fixed: 'Fixed',
    duplicate: 'Duplicate',
    not_planned: 'Not Planned',
    unable_to_reproduce: 'Unable to Reproduce',
    pending: 'Waiting for review',
    published: 'Published',
    rejected: 'Rejected',
  };

  constructor() {
    void this.initialize();
  }

  private request(url: string, options?: RequestInit): Promise<unknown> {
    return this.session.request(url, 'Could not complete the admin request.', options);
  }

  private async initialize(): Promise<void> {
    await this.session.refresh();
    if (this.session.access() === 'signed-in') await this.load();
  }

  /** Called once the admin password was accepted. */
  async signedIn(): Promise<void> {
    await this.load();
  }

  async signOut(): Promise<void> {
    ++this.generation;
    this.items.set([]);
    this.selected.set(null);
    this.nextCursor.set(null);
    this.pendingCount.set(null);
    this.error.set('');
    this.success.set('');
    await this.session.signOut();
  }

  async load(more = false): Promise<void> {
    if (this.session.access() !== 'signed-in' || this.saving()) return;
    const cursor = more ? this.nextCursor() : null;
    if (more && (!cursor || this.loading())) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    if (!more) {
      this.items.set([]);
      this.nextCursor.set(null);
    }
    const query = new URLSearchParams();
    if (this.category()) query.set('category', this.category());
    if (this.statusFilter()) query.set('workflowStatus', this.statusFilter());
    else query.set('includeClosed', String(this.showClosed()));
    if (this.publicationFilter()) query.set('status', this.publicationFilter());
    if (this.search().trim()) query.set('search', this.search().trim());
    if (cursor) query.set('cursor', cursor);
    try {
      const page = OwnFeedbackPageSchema.parse(await this.request('/feedback?' + query));
      if (generation !== this.generation) return;
      this.items.update((items) => (more ? [...items, ...page.items] : page.items));
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      if (generation === this.generation) this.showError(error);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  toggleClosed(show: boolean): void {
    this.showClosed.set(show);
    void this.load();
  }

  select(item: OwnFeedbackItem): void {
    if (this.saving()) return;
    this.selected.set(item);
    this.workflowStatus.set(item.workflowStatus);
    this.reason.set(item.resolutionReason ?? 'implemented');
    this.note.set(item.resolutionNote ?? '');
    this.duplicateId.set(item.duplicateOfId ?? '');
    this.original.set(null);
    this.error.set('');
    this.success.set('');
  }

  setWorkflow(value: unknown): void {
    const status = FeedbackWorkflowStatusSchema.safeParse(value);
    if (status.success) this.workflowStatus.set(status.data);
  }

  setReason(value: unknown): void {
    const reason = FeedbackResolutionReasonSchema.safeParse(value);
    if (reason.success) this.reason.set(reason.data);
  }

  async openReference(id: string, preview = false): Promise<void> {
    if (this.saving()) return;
    try {
      const item = OwnFeedbackItemSchema.parse(
        await this.request('/feedback/' + encodeURIComponent(id)),
      );
      if (preview) this.original.set(item);
      else this.select(item);
    } catch (error) {
      this.showError(error);
    }
  }

  async save(): Promise<void> {
    const item = this.selected();
    if (!item || this.saving()) return;
    const closed = this.workflowStatus() === 'closed';
    const next = FeedbackWorkflowSchema.safeParse({
      workflowStatus: this.workflowStatus(),
      resolutionReason: closed ? this.reason() : null,
      resolutionNote: closed ? this.note().trim() || null : null,
      duplicateOfId:
        closed && this.reason() === 'duplicate' ? this.duplicateId().trim() || null : null,
    });
    if (!next.success) {
      this.error.set(next.error.issues[0]?.message ?? 'Check the resolution details.');
      return;
    }
    const change = UpdateFeedbackWorkflowSchema.safeParse({
      previous: workflowOf(item),
      next: next.data,
    });
    if (!change.success) {
      this.error.set(change.error.issues[0]?.message ?? 'Check the resolution details.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const updated = OwnFeedbackItemSchema.parse(
        await this.request('/feedback/' + item.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(change.data),
        }),
      );
      this.selected.set(updated);
      this.items.update((items) =>
        items.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      this.success.set('Feedback status saved.');
      this.saving.set(false);
      await this.load();
    } catch (error) {
      this.showError(error);
    } finally {
      this.saving.set(false);
    }
  }

  repliesRead(id: string, hasUnreadReplies: boolean): void {
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, hasUnreadReplies } : item)),
    );
    this.selected.update((item) => (item?.id === id ? { ...item, hasUnreadReplies } : item));
  }

  private showError(error: unknown): void {
    this.error.set(
      error instanceof Error ? error.message : 'Could not complete the admin request.',
    );
  }
}
