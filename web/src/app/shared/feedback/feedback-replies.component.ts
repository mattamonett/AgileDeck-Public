import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CreateFeedbackReplySchema,
  FeedbackReplyPageSchema,
  FeedbackReplyReadStateSchema,
  FeedbackReplySchema,
  FEEDBACK_REPLY_MAX,
  type FeedbackReply,
} from '@poker/shared';
import { readJsonResponse } from '@core/api/api-request';

@Component({
  selector: 'app-feedback-replies',
  imports: [FormsModule],
  templateUrl: './feedback-replies.component.html',
  styleUrl: './feedback-replies.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackRepliesComponent {
  readonly feedbackId = input.required<string>();
  readonly baseUrl = input.required<string>();
  /** The admin's view: opens at once and authenticates with the admin cookie. */
  readonly admin = input(false);
  readonly canReply = input(false);
  readonly hasUnread = input(false);
  readonly replyCount = input(0);
  readonly loadedCount = signal<number | null>(null);
  readonly displayedCount = computed(() => this.loadedCount() ?? this.replyCount());
  readonly unreadChange = output<boolean>();
  readonly expanded = signal(false);
  readonly items = signal<FeedbackReply[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly body = signal('');
  readonly permitted = signal(false);
  readonly max = FEEDBACK_REPLY_MAX;
  private generation = 0;

  constructor() {
    effect(() => {
      this.feedbackId();
      this.baseUrl();
      const admin = this.admin();
      untracked(() => {
        ++this.generation;
        this.items.set([]);
        this.loadedCount.set(null);
        this.cursor.set(null);
        this.body.set('');
        this.error.set('');
        this.success.set('');
        this.loading.set(false);
        this.saving.set(false);
        this.permitted.set(false);
        this.expanded.set(admin);
        if (admin) void this.load();
      });
    });
  }

  async toggle(): Promise<void> {
    this.expanded.update((value) => !value);
    if (this.expanded()) await this.load();
  }

  private async request(suffix: string, body?: unknown): Promise<unknown> {
    const response = await fetch(
      this.baseUrl() + '/feedback/' + this.feedbackId() + '/replies' + suffix,
      {
        credentials: 'include',
        cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      },
    );
    return readJsonResponse(response, 'Could not complete the reply request.');
  }

  async load(more = false): Promise<void> {
    if (this.loading() || (more && !this.cursor())) return;
    const generation = this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = FeedbackReplyPageSchema.parse(
        await this.request(more ? '?cursor=' + encodeURIComponent(this.cursor() ?? '') : ''),
      );
      if (generation !== this.generation) return;
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.cursor.set(page.nextCursor);
      this.loadedCount.set(page.totalCount);
      this.permitted.set(page.canReply);
      this.unreadChange.emit(page.hasUnread);
      const ids = page.items.filter((reply) => reply.isUnread).map((reply) => reply.id);
      if (page.canReply && ids.length && this.expanded()) {
        const state = FeedbackReplyReadStateSchema.parse(await this.request('/read', { ids }));
        if (generation !== this.generation) return;
        this.items.update((items) =>
          items.map((item) => (ids.includes(item.id) ? { ...item, isUnread: false } : item)),
        );
        this.unreadChange.emit(state.hasUnread);
      }
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Could not load replies.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async send(): Promise<void> {
    const input = CreateFeedbackReplySchema.safeParse({ body: this.body() });
    if (!input.success) {
      this.error.set(input.error.issues[0]?.message ?? 'Check your reply.');
      return;
    }
    if (this.saving() || this.loading()) return;
    const generation = this.generation;
    this.saving.set(true);
    this.error.set('');
    try {
      const reply = FeedbackReplySchema.parse(await this.request('', input.data));
      if (generation !== this.generation) return;
      this.body.set('');
      await this.load();
      if (generation === this.generation)
        this.success.set(
          reply.status === 'published'
            ? 'Reply published.'
            : 'Reply sent. Only you and the admin can see it until it is approved.',
        );
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Could not send reply.');
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }
}
