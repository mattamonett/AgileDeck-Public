import { TestBed } from '@angular/core/testing';
import { GameEvents } from '@poker/shared';
import { PokerStore } from './poker.store';
import { SocketService } from '@core/socket/socket.service';
import { AppUpdateService } from '@core/update/app-update.service';

const user = {
  id: 'player',
  name: 'Player',
  vote: null,
  hasVoted: false,
  isObserver: false,
  isApproved: true,
};
const room = {
  id: 'room',
  name: null,
  reveal: false,
  autoReveal: false,
  useMultiplier: false,
  multiplierValue: 1,
  theme: 'default',
  lobbyEnabled: true,
  issuesEnabled: true,
  mood: 'playful',
  roundTimer: null,
};

describe('PokerStore socket boundary and lifecycle', () => {
  function setup(updateAvailable = false) {
    const listeners = new Map<string, (data: unknown) => void>();
    const reloadIfUpdateAvailable = vi.fn(() => Promise.resolve(updateAvailable));
    const socket = {
      connected: true,
      on: vi.fn((event: string, listener: (data: unknown) => void) =>
        listeners.set(event, listener),
      ),
      off: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SocketService, useValue: { getSocket: () => socket } },
        { provide: AppUpdateService, useValue: { reloadIfUpdateAvailable } },
      ],
    });
    const store = TestBed.inject(PokerStore);
    const emit = (event: string, data: unknown) => listeners.get(event)?.(data);
    return { store, emit, socket, reloadIfUpdateAvailable };
  }
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reloads into a newer build instead of showing a socket error from an old page', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const { emit, reloadIfUpdateAvailable } = setup(true);
    emit(GameEvents.ERROR, 'Agree to the site use agreement before joining a room.');
    await vi.waitFor(() => expect(reloadIfUpdateAvailable).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows a socket error when this page is already the newest build', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const { emit } = setup();
    emit(GameEvents.ERROR, 'Unable to update room mood');
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith('Unable to update room mood'));
  });

  it('normalizes wire nulls and ignores malformed room and user events', () => {
    const { store, emit } = setup();
    emit(GameEvents.JOINED, { user, room, connectionNonce: 'nonce' });
    expect(store.currentUser()?.vote).toBeUndefined();
    expect(store.currentRoom()?.name).toBe('');
    emit(GameEvents.UPDATE_USERS, [user, { ...user, name: 'Latest' }]);
    expect(store.users()).toHaveLength(1);
    expect(store.currentUser()?.name).toBe('Latest');
    emit(GameEvents.UPDATE_USERS, [{ id: 'bad' }]);
    emit(GameEvents.ROOM_UPDATED, { id: 'bad' });
    emit(GameEvents.REVEAL_STATE, 'false');
    expect(store.users()[0]?.name).toBe('Latest');
    expect(store.currentRoom()?.id).toBe('room');
    expect(store.revealState()).toBe(false);
  });

  it('enables reveal/reset for masked votes using the public hasVoted flag', () => {
    const { store, emit } = setup();
    emit(GameEvents.UPDATE_USERS, [{ ...user, vote: null, hasVoted: true }]);
    expect(store.hasVotes()).toBe(true);
    emit(GameEvents.UPDATE_USERS, [{ ...user, isObserver: true, hasVoted: true }]);
    expect(store.hasVotes()).toBe(false);
  });

  it('replaces countdown timers, cancels on reveal/reset and removes owned listeners on destroy', () => {
    vi.useFakeTimers();
    const { store, emit, socket } = setup();
    emit(GameEvents.REVELATION_STARTED, { seconds: 3 });
    vi.advanceTimersByTime(1000);
    expect(store.countdownValue()).toBe(2);
    emit(GameEvents.REVELATION_STARTED, { seconds: 3 });
    vi.advanceTimersByTime(1000);
    expect(store.countdownValue()).toBe(2);
    emit(GameEvents.REVEAL_STATE, true);
    expect(store.isCountdown()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    emit(GameEvents.REVELATION_STARTED, { seconds: 3 });
    emit(GameEvents.RESET, undefined);
    expect(vi.getTimerCount()).toBe(0);
    store.clearHealthStatus();
    emit(GameEvents.REVELATION_STARTED, { seconds: 3 });
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.off).toHaveBeenCalledTimes(socket.on.mock.calls.length);
  });

  it('anchors the round clock to local receipt time, freezes it on reveal and restarts it on reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { store, emit } = setup();
    emit(GameEvents.JOINED, {
      user,
      room: { ...room, roundTimer: { elapsedMs: 90_000, running: true } },
      connectionNonce: 'nonce',
    });
    expect(store.currentRoom()?.roundClock).toEqual({ startedAt: 910_000, stoppedAt: null });

    vi.setSystemTime(1_030_000);
    emit(GameEvents.ROOM_UPDATED, {
      ...room,
      reveal: true,
      roundTimer: { elapsedMs: 120_000, running: false },
    });
    expect(store.currentRoom()?.roundClock).toEqual({ startedAt: 910_000, stoppedAt: 1_030_000 });

    vi.setSystemTime(1_045_000);
    emit(GameEvents.RESET, undefined);
    expect(store.currentRoom()?.roundClock).toEqual({ startedAt: 1_045_000, stoppedAt: null });
    expect(store.currentRoom()?.reveal).toBe(true);
  });

  it('derives averages only from approved voting players and safely reads snapshots', () => {
    const { store, emit } = setup();
    emit(GameEvents.JOINED, { user, room, connectionNonce: 'nonce' });
    emit(GameEvents.UPDATE_USERS, [
      { ...user, vote: '2' },
      { ...user, id: 'second', vote: '4' },
      { ...user, id: 'observer', isObserver: true, vote: '20' },
      { ...user, id: 'pending', isApproved: false, vote: '20' },
      { ...user, id: 'unsure', vote: '?' },
    ]);
    expect(store.averageVote()).toBe(0);
    emit(GameEvents.REVEAL_STATE, true);
    expect(store.averageVote()).toBe('3.0');
    expect(store.isPerfectMatch()).toBe(false);
    store.setResultSnapshot('bad json');
    expect(store.revealedPlayers()).toEqual([]);
    store.setResultSnapshot(JSON.stringify([{ id: 'player', name: 'Player', vote: null }]));
    expect(store.revealedPlayers()[0]?.vote).toBeUndefined();
  });
});
