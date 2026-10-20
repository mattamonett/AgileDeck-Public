import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ImportIssuesSchema,
  CreateIssueSchema,
  Issue,
  IssueStatus,
  ISSUE_IMPORT_MAX_BYTES,
  ISSUE_TEXT_LIMITS,
  toTransferIssues,
} from '@poker/shared';
import { IssuesStore } from '../state/issues.store';
import { IssueCardComponent } from './issue-card.component';
import { parseEstimate } from './estimate';

@Component({
  selector: 'app-issue-transfer',
  imports: [FormsModule, IssueCardComponent],
  templateUrl: './issue-transfer.component.html',
  styleUrls: ['./issues-shared.css', './issue-transfer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueTransferComponent {
  readonly store = inject(IssuesStore);
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly tab = signal<'import' | 'export'>('import');
  readonly text = signal('');
  readonly preview = signal<Issue[]>([]);
  readonly exportIssues = signal<Issue[]>([]);
  readonly selected = signal(new Set<string>());
  readonly parseError = signal('');
  readonly requestError = signal('');
  readonly editorError = signal('');
  readonly notice = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly collapsed = signal(new Set<string>());
  readonly details = signal(new Set<string>());
  readonly editor = signal<{ id?: string; parentId?: string } | null>(null);
  readonly limits = ISSUE_TEXT_LIMITS;
  readonly statuses = [IssueStatus.OPEN, IssueStatus.IN_PROGRESS, IssueStatus.CLOSED];
  draft = {
    title: '',
    issueNumber: '',
    url: '',
    status: IssueStatus.OPEN,
    estimate: null as number | null,
  };
  readonly chosen = computed(() =>
    this.exportIssues().filter((issue) => this.selected().has(issue.id)),
  );
  readonly exportText = computed(() => JSON.stringify(toTransferIssues(this.chosen()), null, 2));
  readonly rows = computed(() => {
    const result: { issue: Issue; depth: number }[] = [];
    const visit = (items: Issue[], depth: number) => {
      for (const issue of items) {
        result.push({ issue, depth });
        if (!this.collapsed().has(issue.id)) visit(issue.subIssues ?? [], depth + 1);
      }
    };
    visit(this.tab() === 'import' ? this.preview() : this.chosen(), 0);
    return result;
  });
  readonly sample = JSON.stringify(
    [
      {
        title: 'Build the checkout flow',
        issueNumber: 'PBI-123',
        url: 'https://example.com/issues/123',
        status: 'open',
        estimate: 5,
        subIssues: [{ title: 'Add payment form', status: 'open', estimate: null, subIssues: [] }],
      },
    ],
    null,
    2,
  );
  private exportGeneration = 0;

  constructor() {
    effect(() => {
      this.store.context();
      this.exportGeneration++;
      const dialog = this.dialog()?.nativeElement;
      if (dialog?.open) dialog.close();
      this.text.set('');
      this.preview.set([]);
      this.exportIssues.set([]);
      this.selected.set(new Set());
      this.editor.set(null);
      this.parseError.set('');
      this.requestError.set('');
      this.notice.set('');
      this.loading.set(false);
    });
  }

  open() {
    this.dialog()?.nativeElement.showModal();
    if (this.tab() === 'export') void this.loadExport();
  }
  close() {
    if (!this.busy()) this.dialog()?.nativeElement.close();
  }
  changeTab(tab: 'import' | 'export') {
    this.tab.set(tab);
    this.collapsed.set(new Set());
    this.details.set(new Set());
    if (tab === 'export') void this.loadExport();
  }
  async loadExport() {
    const generation = ++this.exportGeneration;
    this.loading.set(true);
    this.requestError.set('');
    this.exportIssues.set([]);
    this.selected.set(new Set());
    try {
      const issues = await this.store.loadExport();
      if (generation !== this.exportGeneration) return;
      this.exportIssues.set(issues);
      this.selected.set(new Set(issues.map((issue) => issue.id)));
    } catch (error) {
      if (generation === this.exportGeneration) this.requestError.set(this.message(error));
    } finally {
      if (generation === this.exportGeneration) this.loading.set(false);
    }
  }
  parse(text: string) {
    this.text.set(text);
    this.notice.set('');
    this.requestError.set('');
    this.editor.set(null);
    this.preview.set([]);
    this.parseError.set('');
    if (!text.trim()) return;
    try {
      if (new TextEncoder().encode(text).length > ISSUE_IMPORT_MAX_BYTES)
        throw new Error('JSON must be 2 MB or smaller.');
      const parsed = ImportIssuesSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        const error = parsed.error.issues[0]!;
        throw new Error(`${error.path.length ? error.path.join('.') + ': ' : ''}${error.message}`);
      }
      let id = 0;
      const decorate = (items: typeof parsed.data): Issue[] =>
        items.map((issue) => ({
          ...issue,
          issueNumber: issue.issueNumber ?? '',
          id: `preview-${++id}`,
          createdAt: '',
          subIssues: decorate(issue.subIssues),
        }));
      this.preview.set(decorate(parsed.data));
      this.collapsed.set(new Set());
      this.details.set(new Set());
    } catch (error) {
      this.parseError.set(this.message(error));
    }
  }
  toggle(id: string, details = false) {
    const state = details ? this.details : this.collapsed;
    state.update((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  select(id: string, checked: boolean) {
    this.selected.update((value) => {
      const next = new Set(value);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  selectAll(all: boolean) {
    this.selected.set(new Set(all ? this.exportIssues().map((issue) => issue.id) : []));
  }
  selectRange(start: string, end: string) {
    const from = Number(start),
      to = Number(end);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from ||
      to > this.exportIssues().length
    )
      return;
    this.selected.set(
      new Set(
        this.exportIssues()
          .slice(from - 1, to)
          .map((issue) => issue.id),
      ),
    );
  }
  startEdit(issue: Issue) {
    this.draft = {
      title: issue.title,
      issueNumber: issue.issueNumber ?? '',
      url: issue.url ?? '',
      status: issue.status,
      estimate: issue.estimate,
    };
    this.editorError.set('');
    this.editor.set({ id: issue.id });
  }
  startAdd(parentId: string) {
    this.draft = { title: '', issueNumber: '', url: '', status: IssueStatus.OPEN, estimate: null };
    this.editorError.set('');
    this.editor.set({ parentId });
  }
  saveEdit(invalidEstimate = false) {
    const editor = this.editor();
    if (!editor) return;
    if (invalidEstimate) {
      this.editorError.set('Enter a number for the estimate, or leave it empty.');
      return;
    }
    const fields = CreateIssueSchema.safeParse(this.draft);
    if (!fields.success) {
      this.editorError.set(fields.error.issues[0]?.message ?? 'Check the issue fields.');
      return;
    }
    if (this.draft.status === IssueStatus.IN_PROGRESS) {
      const clear = (items: Issue[]): Issue[] =>
        items.map((issue) => ({
          ...issue,
          status: issue.status === IssueStatus.IN_PROGRESS ? IssueStatus.OPEN : issue.status,
          subIssues: clear(issue.subIssues ?? []),
        }));
      this.preview.set(clear(this.preview()));
    }
    this.updatePreview(editor.id ?? editor.parentId!, (issue) =>
      editor.id
        ? { ...issue, ...this.draft }
        : {
            ...issue,
            subIssues: [
              ...(issue.subIssues ?? []),
              { ...this.draft, id: 'new', createdAt: '', subIssues: [] },
            ],
          },
    );
  }
  changeEstimate(id: string, input: HTMLInputElement) {
    const parsed = parseEstimate(input);
    if (!parsed.valid) {
      this.parseError.set('Enter a number for the preview estimate, or leave it empty.');
      return;
    }
    this.updatePreview(id, (issue) => ({ ...issue, estimate: parsed.estimate }));
  }
  changeStatus(id: string, status: IssueStatus) {
    // A newly selected active issue wins over an earlier active branch in the draft.
    const clear = (items: Issue[]): Issue[] =>
      items.map((issue) => ({
        ...issue,
        status:
          status === IssueStatus.IN_PROGRESS && issue.status === IssueStatus.IN_PROGRESS
            ? IssueStatus.OPEN
            : issue.status,
        subIssues: clear(issue.subIssues ?? []),
      }));
    this.preview.set(clear(this.preview()));
    this.updatePreview(id, (issue) => ({ ...issue, status }));
  }
  removePreview(id: string) {
    if (this.preview().length === 1 && this.preview()[0]?.id === id) this.parse('');
    else this.updatePreview(id, () => null);
  }
  updatePreview(id: string, update: (issue: Issue) => Issue | null) {
    const walk = (items: Issue[]): Issue[] =>
      items.flatMap((issue) => {
        const next = issue.id === id ? update(issue) : issue;
        return next ? [{ ...next, subIssues: walk(next.subIssues ?? []) }] : [];
      });
    this.parse(JSON.stringify(toTransferIssues(walk(this.preview())), null, 2));
  }
  async submit() {
    if (this.busy() || this.parseError() || !this.preview().length || this.editor()) return;
    this.busy.set(true);
    this.requestError.set('');
    this.notice.set('');
    try {
      const count = await this.store.importAll(toTransferIssues(this.preview()));
      this.parse('');
      this.notice.set(`Imported ${count} issue${count === 1 ? '' : 's'} successfully.`);
    } catch (error) {
      this.requestError.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  private message(error: unknown) {
    return error instanceof Error && error.name !== 'TimeoutError'
      ? error.message
      : 'Request timed out. Check the board before retrying the import.';
  }
}
