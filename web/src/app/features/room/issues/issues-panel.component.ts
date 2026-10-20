import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  signal,
  inject,
  effect,
  untracked,
  viewChild,
} from '@angular/core';
import { IssueCardComponent } from './issue-card.component';
import { IssueTransferComponent } from './issue-transfer.component';
import { FormsModule } from '@angular/forms';
import { Issue, IssueStatus, ISSUE_TEXT_LIMITS } from './issue.model';
import { IssuesStore } from '../state/issues.store';
import { parseEstimate } from './estimate';

@Component({
  selector: 'app-issues-panel',
  providers: [IssuesStore],
  imports: [FormsModule, IssueCardComponent, IssueTransferComponent],
  templateUrl: './issues-panel.component.html',
  styleUrls: ['./issues-shared.css', './issues-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssuesPanelComponent {
  readonly textLimits = ISSUE_TEXT_LIMITS;
  private readonly panelBody = viewChild<ElementRef<HTMLElement>>('panelBody');
  readonly store = inject(IssuesStore);
  readonly issues = this.store.issues;
  readonly collapsed = signal(new Set<string>(this.allIssueIds(this.issues())));
  readonly detailsCollapsed = signal(new Set<string>(this.initiallyCollapsed(this.issues())));
  readonly panelOpen = signal(true);
  readonly editing = signal<{ id?: string; parentId?: string } | null>(null);
  readonly deleting = signal<string | null>(null);
  readonly closedToClear = signal<number | null>(null);
  readonly checkingClosed = signal(false);
  readonly clearNote = signal('');
  readonly statuses = [IssueStatus.OPEN, IssueStatus.IN_PROGRESS, IssueStatus.CLOSED];
  readonly labels = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
  draft: {
    title: string;
    issueNumber: string;
    url: string;
    status: IssueStatus;
    estimate: number | null;
  } = {
    title: '',
    issueNumber: '',
    url: '',
    status: IssueStatus.OPEN,
    estimate: null,
  };
  error = '';
  readonly activeIssue = this.store.activeIssue;
  readonly rows = computed(() => {
    const result: { issue: Issue; depth: number }[] = [];
    const visit = (items: Issue[], depth: number) => {
      for (const issue of items) {
        result.push({ issue, depth });
        if (!this.collapsed().has(issue.id)) visit(issue.subIssues ?? [], depth + 1);
      }
    };
    visit(this.issues(), 0);
    return result;
  });
  readonly totals = computed(() => {
    let total = 0;
    let closed = 0;
    const visit = (items: Issue[]) =>
      items.forEach((issue) => {
        total++;
        if (issue.status === IssueStatus.CLOSED) closed++;
        visit(issue.subIssues ?? []);
      });
    visit(this.issues());
    return { total, closed };
  });

  constructor() {
    let previous = new Map<string, IssueStatus>();
    effect(() => {
      const items = this.issues();
      const current = new Map<string, IssueStatus>();
      const visit = (list: Issue[]) =>
        list.forEach((issue) => {
          current.set(issue.id, issue.status);
          visit(issue.subIssues ?? []);
        });
      visit(items);
      untracked(() => {
        this.collapsed.update((value) => {
          const next = new Set([...value].filter((id) => current.has(id)));
          current.forEach((status, id) => {
            if (!previous.has(id) || (status === IssueStatus.CLOSED && previous.get(id) !== status))
              next.add(id);
          });
          return next;
        });
        this.detailsCollapsed.update((value) => {
          const next = new Set([...value].filter((id) => current.has(id)));
          current.forEach((status, id) => {
            if (status === IssueStatus.IN_PROGRESS && previous.get(id) !== status) next.delete(id);
            else if (
              !previous.has(id) ||
              (status === IssueStatus.CLOSED && previous.get(id) !== status)
            )
              next.add(id);
          });
          return next;
        });
        const editingId = this.editing()?.id;
        if (editingId && current.has(editingId)) this.draft.status = current.get(editingId)!;
        else if (editingId && previous.has(editingId)) this.editing.set(null);
      });
      previous = current;
    });
  }

  toggle(id: string) {
    this.collapsed.update((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  private initiallyCollapsed(items: Issue[]): string[] {
    return items.flatMap((issue) => [
      ...(issue.status !== IssueStatus.IN_PROGRESS ? [issue.id] : []),
      ...this.initiallyCollapsed(issue.subIssues ?? []),
    ]);
  }

  private allIssueIds(items: Issue[]): string[] {
    return items.flatMap((issue) => [issue.id, ...this.allIssueIds(issue.subIssues ?? [])]);
  }

  toggleDetails(id: string) {
    this.detailsCollapsed.update((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  startAdd(parentId?: string) {
    this.draft = { title: '', issueNumber: '', url: '', status: IssueStatus.OPEN, estimate: null };
    this.error = '';
    this.deleting.set(null);
    this.editing.set(parentId ? { parentId } : {});
    this.panelOpen.set(true);
    this.revealEditor();
  }

  startEdit(issue: Issue) {
    this.draft = {
      title: issue.title,
      issueNumber: issue.issueNumber ?? '',
      url: issue.url ?? '',
      status: issue.status,
      estimate: issue.estimate,
    };
    this.error = '';
    this.deleting.set(null);
    this.editing.set({ id: issue.id });
    this.revealEditor();
  }

  async save(invalidEstimate = false) {
    const editor = this.editing();
    if (!editor) return;
    if (
      invalidEstimate ||
      (this.draft.estimate !== null && !Number.isFinite(this.draft.estimate))
    ) {
      this.error = 'Enter a number for the estimate, or leave it empty.';
      return;
    }
    for (const field of ['title', 'url', 'issueNumber'] as const) {
      if (this.draft[field].length > this.textLimits[field]) {
        const label = { url: 'URL', title: 'Title', issueNumber: 'PBI/Task number' }[field];
        this.error = `${label} must be ${this.textLimits[field].toLocaleString('en-US')} characters or fewer.`;
        return;
      }
    }
    if (!this.draft.title.trim()) {
      this.error = 'Give this issue a title.';
      return;
    }
    const url = this.draft.url.trim();
    if (url) {
      try {
        if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error();
      } catch {
        this.error = 'Enter a complete http:// or https:// URL.';
        return;
      }
    }
    const fields = {
      title: this.draft.title.trim(),
      issueNumber: this.draft.issueNumber.trim(),
      status: this.draft.status,
      estimate: this.draft.estimate,
      ...(url ? { url } : {}),
    };
    const saved = await this.store.mutate(
      editor.id ? 'PUT' : 'POST',
      {
        ...fields,
        url,
        ...(editor.parentId ? { parentId: editor.parentId } : {}),
      },
      editor.id,
    );
    if (saved) this.editing.set(null);
  }

  async changeEstimate(id: string, input: HTMLInputElement) {
    const parsed = parseEstimate(input);
    if (!parsed.valid) {
      input.reportValidity();
      return;
    }
    const { estimate } = parsed;
    if (await this.store.mutate('PUT', { estimate }, id)) {
      if (this.editing()?.id === id) this.draft.estimate = estimate;
    }
  }

  async changeStatus(id: string, status: IssueStatus) {
    if (await this.store.mutate('PUT', { status }, id)) {
      if (status === IssueStatus.IN_PROGRESS)
        this.detailsCollapsed.update((value) => {
          const next = new Set(value);
          next.delete(id);
          return next;
        });
    }
  }

  async remove(id: string) {
    if (await this.store.mutate('DELETE', {}, id)) {
      this.deleting.set(null);
      this.editing.set(null);
    }
  }

  async askClearClosed() {
    this.closedToClear.set(null);
    this.clearNote.set('');
    this.checkingClosed.set(true);
    try {
      const count = await this.store.countClosed();
      if (count) this.closedToClear.set(count);
      else this.clearNote.set('There are no closed issues to clear.');
    } catch (error) {
      this.clearNote.set(
        error instanceof Error && error.name !== 'TimeoutError'
          ? error.message
          : 'Could not count closed issues. Please retry.',
      );
    } finally {
      this.checkingClosed.set(false);
    }
  }

  async clearClosed() {
    if (await this.store.clearClosed()) this.closedToClear.set(null);
  }

  private revealEditor() {
    const body = this.panelBody()?.nativeElement;
    if (body) body.scrollTop = 0;
  }
}
