import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { GameEvents, IssueStatus, type IssuePage } from '@poker/shared';
import { IssuesStore } from './issues.store';
import { SocketService } from '@core/socket/socket.service';
import { PokerStore } from './poker.store';

describe('IssuesStore', () => {
  const page = (title: string, nextCursor: string | null = null): IssuePage => ({
    issues: [
      {
        id: title,
        title,
        createdAt: '2026-09-16T00:00:00.000Z',
        status: IssueStatus.OPEN,
        estimate: null,
      },
    ],
    nextCursor,
    activeIssue: null,
  });
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  function setup() {
    const currentRoom = signal({ id: 'room-a' });
    const currentUser = signal({ id: 'user-a', isApproved: true });
    const isConnected = signal(true);
    const listeners = new Map<string, (data?: unknown) => void>();
    const socket = { on: vi.fn((name, callback) => listeners.set(name, callback)), off: vi.fn() };
    const reset = vi.fn();
    const fetchMock = vi.fn().mockImplementation(async () => response(page('first', 'cursor')));
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        IssuesStore,
        { provide: PokerStore, useValue: { currentRoom, currentUser, isConnected } },
        {
          provide: SocketService,
          useValue: { getApiUrl: () => 'http://api.test', getSocket: () => socket, reset },
        },
      ],
    });
    const store = TestBed.inject(IssuesStore);
    TestBed.tick();
    return { store, fetchMock, currentRoom, currentUser, isConnected, listeners, socket, reset };
  }
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('starts a fresh round after voting on an issue or moving to the next one', async () => {
    const { store, fetchMock, reset } = setup();
    await settle();
    const active = {
      ...page('next'),
      activeIssue: { ...page('next').issues[0]!, status: IssueStatus.IN_PROGRESS },
    };
    fetchMock
      .mockResolvedValueOnce(response({ id: 'first' }))
      .mockResolvedValueOnce(response(active));
    await store.startVoting('first');
    expect(fetchMock.mock.calls.at(-2)).toEqual([
      'http://api.test/api/rooms/room-a/issues/first?userId=user-a',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ status: 'in_progress' }) }),
    ]);
    expect(reset).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(response({ id: 'next' }))
      .mockResolvedValueOnce(response(active));
    await store.startNext();
    expect(fetchMock.mock.calls.at(-2)).toEqual([
      'http://api.test/api/rooms/room-a/issues/next?userId=user-a',
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(fetchMock.mock.calls.at(-2)?.[1]).not.toHaveProperty('body');
    expect(reset).toHaveBeenCalledTimes(2);

    fetchMock
      .mockResolvedValueOnce(response({ id: null }))
      .mockResolvedValueOnce(response(page('done')));
    await store.startNext();
    expect(reset).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(response({ message: 'Nope' }, 403));
    await store.startVoting('first');
    expect(store.error()).toBe('Nope');
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('ignores a failed mutation after navigation to another room', async () => {
    const { store, fetchMock, currentRoom } = setup();
    await settle();
    let rejectRequest: (reason: Error) => void = () => {
      throw new Error('Request not initialized');
    };
    const pending = new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    });
    fetchMock.mockReturnValueOnce(pending);
    const mutation = store.mutate('POST', { title: 'Old room issue' });
    expect(store.saving()).toBe(true);
    currentRoom.set({ id: 'room-b' });
    TestBed.tick();
    await settle();
    expect(store.saving()).toBe(false);
    rejectRequest(new Error('Old room failure'));
    expect(await mutation).toBe(false);
    expect(store.error()).toBe('');
  });

  it('rejects malformed issue pages without replacing valid state', async () => {
    const { store, fetchMock } = setup();
    await settle();
    fetchMock.mockResolvedValueOnce(
      response({ issues: 'not an array', activeIssue: null, nextCursor: null }),
    );
    await store.refresh();
    expect(store.issues()[0]?.title).toBe('first');
    expect(store.error()).not.toBe('');
  });

  it('posts one import batch with credentials, refreshes page one and propagates failures', async () => {
    const { store, fetchMock } = setup();
    await settle();
    const issues = [
      { title: 'Imported', url: '', status: IssueStatus.OPEN, estimate: null, subIssues: [] },
    ];
    fetchMock
      .mockResolvedValueOnce(response({ count: 1 }, 201))
      .mockResolvedValueOnce(response(page('Imported')));
    expect(await store.importAll(issues)).toBe(1);
    const call = fetchMock.mock.calls.find(([url]) => url.includes('/import?'))!;
    expect(call[0]).toBe('http://api.test/api/rooms/room-a/issues/import?userId=user-a');
    expect(call[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(issues),
    });
    expect(store.page()).toBe(1);
    expect(store.issues()[0]?.title).toBe('Imported');
    fetchMock.mockResolvedValueOnce(response({ message: 'Room is full' }, 409));
    await expect(store.importAll(issues)).rejects.toThrow('Room is full');
    expect(store.saving()).toBe(false);
  });

  it('loads the complete export independently of panel pagination', async () => {
    const { store, fetchMock } = setup();
    await settle();
    const issues = page('Exported').issues;
    fetchMock.mockResolvedValueOnce(response(issues));
    expect(await store.loadExport()).toEqual(issues);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(
      'http://api.test/api/rooms/room-a/issues/export?userId=user-a',
    );
    expect(store.issues()[0]?.title).toBe('first');
  });

  it('sends room/user credentials, loads another page and preserves it during unrelated room updates', async () => {
    const { store, fetchMock, currentUser, currentRoom } = setup();
    await settle();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://api.test/api/rooms/room-a/issues?userId=user-a',
    );
    expect(fetchMock.mock.calls[0]![1].credentials).toBe('include');
    fetchMock.mockResolvedValueOnce(response(page('second')));
    store.next();
    await settle();
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('&cursor=cursor');
    expect(store.page()).toBe(2);
    const calls = fetchMock.mock.calls.length;
    currentUser.set({ id: 'user-a', isApproved: true });
    currentRoom.set({ id: 'room-a' });
    TestBed.tick();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(store.page()).toBe(2);
    fetchMock.mockResolvedValueOnce(response(page('first', 'cursor')));
    store.previous();
    await settle();
    expect(store.issues()[0]!.title).toBe('first');
  });

  it('refreshes matching room events and reconnects, and unregisters listeners', async () => {
    const { store, fetchMock, listeners, isConnected, socket } = setup();
    await settle();
    const calls = fetchMock.mock.calls.length;
    listeners.get(GameEvents.ISSUES_CHANGED)!({ roomId: 'other' });
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    fetchMock.mockResolvedValueOnce(response(page('remote edit')));
    listeners.get(GameEvents.ISSUES_CHANGED)!({ roomId: 'room-a' });
    await settle();
    expect(store.issues()[0]!.title).toBe('remote edit');
    isConnected.set(false);
    TestBed.tick();
    expect(store.issues()).toEqual([]);
    fetchMock.mockResolvedValueOnce(response(page('reconnected')));
    isConnected.set(true);
    TestBed.tick();
    await settle();
    expect(store.issues()[0]!.title).toBe('reconnected');
    TestBed.resetTestingModule();
    expect(socket.off).toHaveBeenCalledWith(GameEvents.ISSUES_CHANGED, expect.any(Function));
  });

  it('ignores out-of-order responses and responses from a room that was left', async () => {
    const { store, fetchMock, currentRoom } = setup();
    await settle();
    let resolveOld!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = store.refresh();
    fetchMock.mockResolvedValueOnce(response(page('latest')));
    await store.refresh();
    resolveOld(response(page('stale')));
    await old;
    expect(store.issues()[0]!.title).toBe('latest');
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const oldRoom = store.refresh();
    fetchMock.mockResolvedValueOnce(response(page('new room')));
    currentRoom.set({ id: 'room-b' });
    TestBed.tick();
    await settle();
    resolveOld(response(page('old room')));
    await oldRoom;
    expect(store.issues()[0]!.title).toBe('new room');
  });

  it('returns to the newest page after creating a root and exposes mutation failures', async () => {
    const { store, fetchMock } = setup();
    await settle();
    fetchMock.mockResolvedValueOnce(response(page('second')));
    store.next();
    await settle();
    fetchMock.mockResolvedValueOnce(response({ id: 'new' }, 201));
    fetchMock.mockResolvedValueOnce(response(page('new')));
    expect(await store.mutate('POST', { title: 'new' })).toBe(true);
    expect(store.page()).toBe(1);
    expect(store.issues()[0]!.title).toBe('new');
    const write = fetchMock.mock.calls.find((call) => call[1].method === 'POST')!;
    expect(JSON.parse(write[1].body)).toEqual({ title: 'new' });
    fetchMock.mockResolvedValueOnce(response({ message: 'Access denied' }, 403));
    expect(await store.mutate('DELETE', {}, 'new')).toBe(false);
    expect(store.error()).toBe('Access denied');
    expect(store.saving()).toBe(false);
    expect(store.issues()[0]!.title).toBe('new');
  });

  it('counts closed issues room-wide, then clears them and returns to page one', async () => {
    const { store, fetchMock } = setup();
    await settle();
    store.next();
    await settle();
    expect(store.page()).toBe(2);

    fetchMock.mockResolvedValueOnce(response({ count: 4 }));
    expect(await store.countClosed()).toBe(4);
    expect(fetchMock.mock.calls.at(-1)).toEqual([
      'http://api.test/api/rooms/room-a/issues/closed?userId=user-a',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    ]);
    fetchMock.mockResolvedValueOnce(response({ count: -1 }));
    await expect(store.countClosed()).rejects.toThrow();

    fetchMock
      .mockResolvedValueOnce(response({ count: 4 }))
      .mockResolvedValueOnce(response(page('first')));
    expect(await store.clearClosed()).toBe(true);
    expect(fetchMock.mock.calls.at(-2)).toEqual([
      'http://api.test/api/rooms/room-a/issues/closed?userId=user-a',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    ]);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      'http://api.test/api/rooms/room-a/issues?userId=user-a',
    );
    expect(store.page()).toBe(1);
  });
});
