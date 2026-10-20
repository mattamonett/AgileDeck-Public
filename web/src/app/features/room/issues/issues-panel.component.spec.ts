import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { IssuesPanelComponent } from './issues-panel.component';
import { IssuesStore } from '../state/issues.store';
import { IssueStatus, type Issue } from './issue.model';

describe('IssuesPanelComponent', () => {
  function setup() {
    const root: Issue = {
      id: 'root',
      title: 'Root',
      status: IssueStatus.OPEN,
      estimate: null,
      createdAt: '2026-09-16T00:00:00.000Z',
      subIssues: [
        {
          id: 'child',
          title: 'Child',
          status: IssueStatus.OPEN,
          estimate: null,
          createdAt: '2026-09-16T00:00:00.000Z',
        },
      ],
    };
    const store = {
      issues: signal([root]),
      activeIssue: signal<Issue | null>(null),
      loading: signal(false),
      saving: signal(false),
      error: signal(''),
      context: signal({ roomId: 'room', userId: 'user' }),
      page: signal(1),
      nextCursor: signal<string | null>('cursor'),
      next: vi.fn(),
      previous: vi.fn(),
      refresh: vi.fn(),
      mutate: vi.fn().mockResolvedValue(true),
      countClosed: vi.fn().mockResolvedValue(3),
      clearClosed: vi.fn().mockResolvedValue(true),
    };
    TestBed.overrideComponent(IssuesPanelComponent, {
      set: { providers: [{ provide: IssuesStore, useValue: store }] },
    });
    const fixture = TestBed.createComponent(IssuesPanelComponent);
    fixture.detectChanges();
    return { fixture, panel: fixture.componentInstance, store };
  }

  it('loads server issues with children initially hidden and wires paging', () => {
    const { fixture, panel, store } = setup();
    expect(panel.rows().length).toBe(1);
    panel.toggle('root');
    expect(panel.rows().length).toBe(2);
    const buttons = fixture.nativeElement.querySelectorAll('footer button');
    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();
    expect(store.next).toHaveBeenCalled();
    store.nextCursor.set(null);
    fixture.detectChanges();
    expect(buttons[1].disabled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Sample backlog');
  });

  it('posts children and updates fields without supplying client ids or timestamps', async () => {
    const { panel, store } = setup();
    panel.startAdd('root');
    panel.draft.title = ' Child ';
    panel.draft.estimate = 3.5;
    await panel.save();
    expect(store.mutate).toHaveBeenLastCalledWith(
      'POST',
      {
        title: 'Child',
        status: IssueStatus.OPEN,
        estimate: 3.5,
        issueNumber: '',
        url: '',
        parentId: 'root',
      },
      undefined,
    );
    expect(panel.editing()).toBeNull();
    panel.startEdit(panel.issues()[0]!);
    panel.draft.url = '';
    await panel.save();
    expect(store.mutate).toHaveBeenLastCalledWith(
      'PUT',
      {
        title: 'Root',
        status: IssueStatus.OPEN,
        estimate: null,
        issueNumber: '',
        url: '',
      },
      'root',
    );
    await panel.remove('root');
    expect(store.mutate).toHaveBeenLastCalledWith('DELETE', {}, 'root');
  });

  it('edits and clears PBI/Task numbers, displays remote values and enforces the limit', async () => {
    const { fixture, panel, store } = setup();
    store.issues.update((items) => [{ ...items[0]!, issueNumber: '001234' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.issue-number').textContent).toContain('001234');
    panel.startEdit(panel.issues()[0]!);
    expect(panel.draft.issueNumber).toBe('001234');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#issue-number').maxLength).toBe(100);
    panel.draft.issueNumber = ' TASK-123 ';
    await panel.save();
    expect(store.mutate).toHaveBeenLastCalledWith(
      'PUT',
      expect.objectContaining({ issueNumber: 'TASK-123' }),
      'root',
    );
    panel.startEdit(panel.issues()[0]!);
    panel.draft.issueNumber = '';
    await panel.save();
    expect(store.mutate).toHaveBeenLastCalledWith(
      'PUT',
      expect.objectContaining({ issueNumber: '' }),
      'root',
    );
    store.mutate.mockClear();
    panel.startAdd('root');
    panel.draft.title = 'Task';
    panel.draft.issueNumber = 'x'.repeat(101);
    await panel.save();
    expect(panel.error).toContain('100');
    expect(store.mutate).not.toHaveBeenCalled();
  });

  it('keeps the editor open and existing issues intact on failed saves', async () => {
    const { fixture, panel, store } = setup();
    store.mutate.mockResolvedValue(false);
    store.error.set('Not authorized');
    panel.startEdit(panel.issues()[0]!);
    panel.draft.title = 'Attempt';
    await panel.save();
    fixture.detectChanges();
    expect(panel.editing()).toEqual({ id: 'root' });
    expect(panel.issues()[0]!.title).toBe('Root');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Not authorized',
    );
  });

  it('validates titles, links and estimates before calling the API', async () => {
    const { panel, store } = setup();
    panel.startAdd();
    panel.draft.title = ' ';
    await panel.save();
    expect(panel.error).toContain('title');
    panel.draft.title = 'Valid';
    panel.draft.url = 'javascript:alert(1)';
    await panel.save();
    expect(panel.error).toContain('URL');
    panel.draft.url = '';
    panel.draft.estimate = Infinity;
    await panel.save();
    expect(panel.error).toContain('number');
    expect(store.mutate).not.toHaveBeenCalled();
  });

  it('sends status and estimate patches and applies broadcasts without expanding children', async () => {
    const { fixture, panel, store } = setup();
    panel.startEdit(panel.issues()[0]!);
    await panel.changeStatus('child', IssueStatus.IN_PROGRESS);
    expect(store.mutate).toHaveBeenLastCalledWith(
      'PUT',
      { status: IssueStatus.IN_PROGRESS },
      'child',
    );
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '8';
    await panel.changeEstimate('root', input);
    expect(store.mutate).toHaveBeenLastCalledWith('PUT', { estimate: 8 }, 'root');
    expect(panel.draft.estimate).toBe(8);
    store.issues.update((items) => [{ ...items[0]!, status: IssueStatus.IN_PROGRESS }]);
    fixture.detectChanges();
    expect(panel.draft.status).toBe(IssueStatus.IN_PROGRESS);
    expect(panel.detailsCollapsed().has('root')).toBe(false);
    expect(panel.collapsed().has('root')).toBe(true);
    store.issues.set([]);
    fixture.detectChanges();
    expect(panel.editing()).toBeNull();
  });

  it('confirms with the room-wide count before clearing closed issues', async () => {
    const { fixture, store } = setup();
    const element: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    button('Clear closed')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.clearClosed).not.toHaveBeenCalled();
    expect(element.querySelector('.clear-closed')?.textContent).toContain(
      'Delete 3 closed issues from this room?',
    );

    button('Keep them')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.clear-closed')).toBeNull();
    expect(store.clearClosed).not.toHaveBeenCalled();

    button('Clear closed')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    button('Delete 3')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.clearClosed).toHaveBeenCalledTimes(1);
    expect(element.querySelector('.clear-closed')).toBeNull();

    store.countClosed.mockResolvedValue(0);
    button('Clear closed')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('.clear-note')?.textContent).toContain(
      'There are no closed issues to clear.',
    );
    expect(button('Delete 0')).toBeUndefined();
  });
});
