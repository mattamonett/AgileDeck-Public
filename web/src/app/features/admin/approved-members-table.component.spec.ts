import { TestBed } from '@angular/core/testing';
import type { AdminApprovedMember } from '@poker/shared';
import { ApprovedMembersTableComponent } from './approved-members-table.component';

const member: AdminApprovedMember = {
  memberReference: 'ref-1',
  name: null,
  isObserver: null,
  isApproved: true,
  isCurrent: false,
  createdAt: null,
  rateLimitCount: 3,
  lastRateLimitAt: null,
};
describe('ApprovedMembersTableComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders approved members and emits sort and delete requests', () => {
    const fixture = TestBed.createComponent(ApprovedMembersTableComponent);
    fixture.componentRef.setInput('roomName', 'Planning');
    fixture.componentRef.setInput('members', [member]);
    fixture.componentRef.setInput('sort', 'name');
    fixture.componentRef.setInput('direction', 'asc');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const events: unknown[] = [];
    fixture.componentInstance.sortBy.subscribe((column) => events.push(column));
    fixture.componentInstance.deleteMember.subscribe((deleted) => events.push(deleted));

    expect(element.querySelector('caption')?.textContent).toContain('Approved members of');
    expect(element.querySelector('caption')?.textContent).toContain('Planning');
    expect(element.querySelectorAll('th[aria-sort]')).toHaveLength(7);
    const cells = Array.from(element.querySelectorAll('tbody td'), (cell) =>
      cell.textContent?.trim(),
    );
    expect(cells.slice(0, 7)).toEqual([
      'Name unavailable',
      'Not currently participating',
      'Not yet recorded',
      'Approved',
      'Not yet recorded',
      '3',
      'None recorded',
    ]);
    element.querySelectorAll<HTMLButtonElement>('.sort-button')[1]?.click();
    element.querySelector<HTMLButtonElement>('.danger')?.click();
    expect(events).toEqual(['isCurrent', member]);
  });

  it('explains an empty approved list according to load state', () => {
    const fixture = TestBed.createComponent(ApprovedMembersTableComponent);
    fixture.componentRef.setInput('roomName', 'Planning');
    fixture.componentRef.setInput('members', []);
    fixture.componentRef.setInput('sort', 'name');
    fixture.componentRef.setInput('direction', 'asc');
    fixture.componentRef.setInput('unavailable', true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('tbody')?.textContent?.trim()).toBe(
      'Approved members unavailable.',
    );
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(element.querySelector('tbody')?.textContent?.trim()).toBe('Loading approved members…');
    expect(
      Array.from(element.querySelectorAll<HTMLButtonElement>('.sort-button')).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
  });
});
