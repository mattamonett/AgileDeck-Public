import { TestBed } from '@angular/core/testing';
import { RoomMoodSchema, THEMES, type AdminRoom } from '@poker/shared';
import { RoomAdminComponent } from './room-admin.component';
import { resolveApiUrl } from '@core/api/api-url';

const API = resolveApiUrl();

const room: AdminRoom = {
  id: 'sprint-room_42',
  name: '<img src=x> Planning',
  theme: 'space',
  mood: 'spicy',
  approvedMemberCount: 6,
  memberCount: 1,
  issueCount: 2,
  lastActivityAt: '2026-09-30T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const user = {
  memberReference: 'test-reference',
  rateLimitCount: 0,
  lastRateLimitAt: null,
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Alice',
  isObserver: true,
  isApproved: false,
  createdAt: room.createdAt,
};

describe('RoomAdminComponent', () => {
  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.startsWith(API + '/api/admin/rooms?')
                ? { items: [room], nextCursor: null }
                : {
                    room,
                    approvedMembers: [],
                    nextApprovedOffset: null,
                    users: [user],
                    nextCursor: null,
                  },
            ),
          ),
      ),
    );
    await TestBed.configureTestingModule({ imports: [RoomAdminComponent] }).compileComponents();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function create() {
    const fixture = TestBed.createComponent(RoomAdminComponent);
    await fixture.whenStable();
    // whenStable does not wait for the list fetch, and reading the response body can take
    // longer on some Node versions, so wait for the first load to settle.
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture;
  }

  it('renders a table and opens members through the room button without interpreting markup', async () => {
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain(room.name);
    expect(element.querySelector('thead')?.textContent).toContain('Theme');
    expect(element.querySelector('tbody tr')?.textContent).toContain('Deep Space');
    expect(element.querySelector('thead')?.textContent).toContain('Mood');
    expect(element.querySelector('tbody tr')?.textContent).toContain('Spicy');
    expect(element.querySelector('img')).toBeNull();
    element.querySelector<HTMLButtonElement>('.room-name')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Alice');
    expect(element.textContent).toContain('Observer');
    expect(element.textContent).toContain('Pending');
    expect(element.querySelector('#room-details')?.textContent).toContain('Deep Space');
    expect(element.querySelector('#room-details')?.textContent).toContain('Mood: Spicy');
    expect(element.querySelector('.room-name')?.getAttribute('aria-expanded')).toBe('true');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('refreshes the room mood in the list and details for every mood', async () => {
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    for (const mood of RoomMoodSchema.options) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            room: { ...room, mood },
            approvedMembers: [],
            nextApprovedOffset: null,
            users: [],
            nextCursor: null,
          }),
        ),
      );
      await fixture.componentInstance.select(room);
      fixture.detectChanges();
      expect(element.querySelector('tbody tr')?.children[2]?.textContent?.trim()).toBe(
        { friendly: 'Friendly', playful: 'Playful', spicy: 'Spicy' }[mood],
      );
      expect(element.querySelector('#room-details')?.textContent).toContain(
        'Mood: ' + { friendly: 'Friendly', playful: 'Playful', spicy: 'Spicy' }[mood],
      );
    }
  });

  it('displays shared theme names and safely renders unknown stored themes', async () => {
    const fixture = await create();
    for (const theme of THEMES) {
      fixture.componentInstance.rooms.set([{ ...room, theme: theme.id }]);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('tbody tr')?.textContent).toContain(theme.name);
    }
    fixture.componentInstance.rooms.set([{ ...room, theme: '<img src=x> legacy' }]);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('<img src=x> legacy');
    expect(element.querySelector('img')).toBeNull();
  });

  it('shows a concise error without claiming the room list is empty when the response is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ ...room, id: 'invalid/room' }], nextCursor: null })),
    );
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Could not load rooms. Refresh the page and try again.');
    expect(element.textContent).toContain('Rooms unavailable.');
    expect(element.textContent).not.toContain('No rooms have been created yet.');
    expect(element.textContent).not.toContain('invalid_format');
  });

  it('distinguishes remembered approvals from an empty current participant list', async () => {
    const emptyRoom = { ...room, memberCount: 0 };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [emptyRoom], nextCursor: null })),
    );
    const fixture = await create();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          room: emptyRoom,
          approvedMembers: [
            {
              name: null,
              isCurrent: false,
              isObserver: null,
              isApproved: true,
              createdAt: null,
              memberReference: 'test-reference',
              rateLimitCount: 0,
              lastRateLimitAt: null,
            },
            {
              name: 'Alice',
              isCurrent: false,
              isObserver: true,
              isApproved: true,
              createdAt: room.createdAt,
              memberReference: 'test-reference',
              rateLimitCount: 4,
              lastRateLimitAt: room.createdAt,
            },
          ],
          nextApprovedOffset: null,
          users: [],
          nextCursor: null,
        }),
      ),
    );
    await fixture.componentInstance.select(emptyRoom);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('6 approved members · 0 current participants');
    expect(element.textContent).toContain('Name unavailable');
    expect(element.textContent).toContain('No current participants.');
    const roster = element.querySelectorAll('table')[1];
    expect(roster?.textContent).toContain('Observer');
    expect(roster?.textContent).toContain('Approved');
    expect(roster?.textContent).toContain('Last joined');
    expect(roster?.textContent).toContain('Rate-limit hits (30d)');
    expect(
      roster?.querySelectorAll(':scope > tbody > tr')[1]?.children[5]?.textContent?.trim(),
    ).toBe('4');
    expect(roster?.textContent).toContain('Not yet recorded');
    expect(element.textContent).not.toContain('This room has no members.');
  });

  it('toggles sorting from column buttons and preserves sort settings when loading more', async () => {
    const fixture = await create();
    const element: HTMLElement = fixture.nativeElement;
    const nameSort = element.querySelector<HTMLButtonElement>('thead button');
    nameSort?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(String(vi.mocked(fetch).mock.lastCall?.[0])).toContain('sort=name&direction=asc');
    nameSort?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('th')?.getAttribute('aria-sort')).toBe('descending');
    fixture.componentInstance.nextCursor.set(room.id);
    await fixture.componentInstance.load(true);
    expect(String(vi.mocked(fetch).mock.lastCall?.[0])).toContain(
      'sort=name&direction=desc&cursor=',
    );
    await fixture.componentInstance.select(room);
    fixture.detectChanges();
    const tables = element.querySelectorAll('table');
    tables[1]?.querySelector<HTMLButtonElement>('thead button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(String(vi.mocked(fetch).mock.lastCall?.[0])).toContain(
      'approvedSort=name&approvedDirection=desc',
    );
    tables[2]?.querySelector<HTMLButtonElement>('thead button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(String(vi.mocked(fetch).mock.lastCall?.[0])).toContain(
      'memberSort=name&memberDirection=asc',
    );
  });

  it('keeps the latest selected room when a previous detail request completes late', async () => {
    const fixture = await create();
    let resolveFirst: (response: Response) => void = () => {
      throw new Error('Missing request.');
    };
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const first = fixture.componentInstance.select(room);
    const secondRoom = { ...room, id: '10000000-0000-4000-8000-000000000002', name: 'Second room' };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          room: secondRoom,
          approvedMembers: [],
          nextApprovedOffset: null,
          users: [],
          nextCursor: null,
        }),
      ),
    );
    await fixture.componentInstance.select(secondRoom);
    resolveFirst(
      new Response(
        JSON.stringify({
          room,
          approvedMembers: [],
          nextApprovedOffset: null,
          users: [user],
          nextCursor: null,
        }),
      ),
    );
    await first;
    expect(fixture.componentInstance.selected()?.id).toBe(secondRoom.id);
    expect(fixture.componentInstance.users()).toEqual([]);
  });

  it('loads additional room and member pages and keeps failures actionable', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.nextCursor.set(room.id);
    const other = { ...room, id: '10000000-0000-4000-8000-000000000002', name: null };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [other], nextCursor: null })),
    );
    await component.load(true);
    expect(component.rooms()).toHaveLength(2);
    await component.select(room);
    component.nextUserCursor.set(user.id);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          room,
          approvedMembers: [],
          nextApprovedOffset: null,
          users: [{ ...user, id: other.id, name: 'Bob' }],
          nextCursor: null,
        }),
      ),
    );
    await component.select(room, true);
    expect(component.users().map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Room not found.' }), { status: 404 }),
    );
    await component.select(other);
    expect(component.userError()).toBe('Room not found.');
    expect(component.loadingUsers()).toBe(false);
    component.close();
    expect(component.selected()).toBeNull();
  });
  it('shows room name and approved count and sends no deletion on cancel', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.askDeleteRoom(room);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('dialog')?.textContent).toContain(room.name);
    expect(element.querySelector('dialog')?.textContent).toContain('Approved members: 6');
    component.cancelDelete();
    expect(element.querySelector('dialog')?.open).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('confirms global user deletion while preserving feedback and submits the opaque reference', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.askDeleteUser(room, user);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('dialog')?.textContent).toContain('Alice');
    expect(element.querySelector('dialog')?.textContent).toContain(
      'Feedback and conversations are preserved',
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await component.confirmDelete();
    expect(fetch).toHaveBeenCalledWith(
      API + '/api/admin/rooms/' + room.id + '/members/test-reference',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ name: 'Alice' }) }),
    );
    expect(component.deleteTarget()).toBeNull();
  });

  it('retains confirmation and server error after a failed deletion', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.askDeleteRoom(room);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Room changed. Refresh.' }), { status: 409 }),
    );
    await component.confirmDelete();
    expect(component.deleteError()).toBe('Room changed. Refresh.');
    expect(component.deleteTarget()?.kind).toBe('room');
    expect(component.deleting()).toBe(false);
  });
});
