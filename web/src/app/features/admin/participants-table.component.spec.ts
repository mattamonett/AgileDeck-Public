import { TestBed } from '@angular/core/testing';
import type { AdminRoomUser } from '@poker/shared';
import { ParticipantsTableComponent } from './participants-table.component';

const user: AdminRoomUser = {
  memberReference: 'ref-2',
  rateLimitCount: 0,
  lastRateLimitAt: null,
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Alice',
  isObserver: true,
  isApproved: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ParticipantsTableComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders current participants with their approval badge', () => {
    const fixture = TestBed.createComponent(ParticipantsTableComponent);
    fixture.componentRef.setInput('roomName', 'Planning');
    fixture.componentRef.setInput('members', [user]);
    fixture.componentRef.setInput('sort', 'createdAt');
    fixture.componentRef.setInput('direction', 'desc');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const deleted: unknown[] = [];
    fixture.componentInstance.deleteMember.subscribe((entry) => deleted.push(entry));
    expect(element.querySelectorAll('th[aria-sort]')).toHaveLength(6);
    expect(element.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Joined');
    expect(element.querySelector('.badge.pending')?.textContent).toBe('Pending');
    expect(element.querySelector('tbody')?.textContent).toContain('Observer');
    element.querySelector<HTMLButtonElement>('.danger')?.click();
    expect(deleted).toEqual([user]);
  });
});
