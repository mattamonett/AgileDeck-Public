import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { IssueTransferComponent } from './issue-transfer.component';
import { IssuesStore } from '../state/issues.store';
import { IssueStatus, type Issue } from '@poker/shared';

describe('IssueTransferComponent', () => {
  function setup() {
    const store = {
      context: signal({ roomId: 'room', userId: 'user' }),
      saving: signal(false),
      importAll: vi.fn().mockResolvedValue(2),
      loadExport: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: IssuesStore, useValue: store }] });
    const fixture = TestBed.createComponent(IssueTransferComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, store };
  }
  it('updates the submitted JSON from shared preview controls and clears only after success', async () => {
    const { fixture, component, store } = setup();
    component.parse(JSON.stringify([{ title: 'Parent', subIssues: [{ title: 'Child' }] }]));
    fixture.detectChanges();
    const estimates = fixture.nativeElement.querySelectorAll('.inline-estimate input');
    estimates[1].value = '8';
    estimates[1].dispatchEvent(new Event('input'));
    expect(component.preview()[0]!.subIssues![0]!.estimate).toBe(8);
    expect(JSON.parse(component.text())[0].subIssues[0].estimate).toBe(8);
    component.startEdit(component.preview()[0]!);
    component.draft.title = 'Edited';
    component.saveEdit();
    await component.submit();
    expect(store.importAll.mock.calls[0]![0][0]).toMatchObject({
      title: 'Edited',
      subIssues: [{ title: 'Child', estimate: 8 }],
    });
    expect(component.text()).toBe('');
    expect(component.preview()).toEqual([]);
    expect(component.notice()).toContain('Imported 2 issues');
  });
  it('retains drafts after API failures and blocks invalid JSON', async () => {
    const { component, store } = setup();
    component.parse('[{"title":"Good"}]');
    store.importAll.mockRejectedValue(new Error('Room is full'));
    await component.submit();
    expect(component.preview()).toHaveLength(1);
    expect(component.requestError()).toBe('Room is full');
    component.parse('[{"title":"Good","subIssues":[{"title":"Bad","url":"javascript:bad"}]}]');
    expect(component.preview()).toEqual([]);
    expect(component.parseError()).not.toBe('');
    await component.submit();
    expect(store.importAll).toHaveBeenCalledTimes(1);
  });
  it('keeps invalid editor drafts open and prevents importing an invalid inline estimate', async () => {
    const { component, store } = setup();
    component.parse('[{"title":"Issue"}]');
    component.startEdit(component.preview()[0]!);
    component.draft.url = 'javascript:bad';
    component.saveEdit();
    expect(component.editor()).not.toBeNull();
    expect(component.editorError()).not.toBe('');
    component.editor.set(null);
    const input = document.createElement('input');
    input.type = 'number';
    input.setCustomValidity('Invalid number');
    component.changeEstimate(component.preview()[0]!.id, input);
    await component.submit();
    expect(store.importAll).not.toHaveBeenCalled();
    input.setCustomValidity('');
    input.value = '8';
    component.changeEstimate(component.preview()[0]!.id, input);
    expect(component.parseError()).toBe('');
    expect(component.preview()[0]!.estimate).toBe(8);
  });

  it('selects roots by range and always exports their descendants without server metadata', async () => {
    const { component, store } = setup();
    const root: Issue = {
      id: 'one',
      createdAt: '2026-09-16',
      title: 'Root',
      estimate: null,
      status: IssueStatus.OPEN,
      subIssues: [
        {
          id: 'child',
          createdAt: '2026-09-16',
          title: 'Child',
          estimate: 3,
          status: IssueStatus.CLOSED,
        },
      ],
    };
    store.loadExport.mockResolvedValue([
      root,
      { ...root, id: 'two', title: 'Second', subIssues: [] },
    ]);
    component.tab.set('export');
    await component.loadExport();
    component.selectRange('1', '1');
    expect(component.rows()).toHaveLength(2);
    const json = JSON.parse(component.exportText());
    expect(json).toHaveLength(1);
    expect(json[0].subIssues[0].title).toBe('Child');
    expect(json[0].id).toBeUndefined();
    component.select('one', false);
    expect(component.exportText()).toBe('[]');
  });
  it('adds and removes preview children and normalizes the active branch', () => {
    const { component } = setup();
    component.parse('[{"title":"Parent"},{"title":"Other","status":"in_progress"}]');
    component.startAdd(component.preview()[0]!.id);
    component.draft.title = 'New child';
    component.saveEdit();
    const child = component.preview()[0]!.subIssues![0]!;
    component.changeStatus(child.id, IssueStatus.IN_PROGRESS);
    expect(component.preview().map((issue) => issue.status)).toEqual(['in_progress', 'open']);
    component.removePreview(component.preview()[0]!.id);
    expect(component.preview().map((issue) => issue.title)).toEqual(['Other']);
    component.removePreview(component.preview()[0]!.id);
    expect(component.text()).toBe('');
  });
});
