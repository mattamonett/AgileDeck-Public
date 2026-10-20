import { TestBed } from '@angular/core/testing';
import { patchState, signalStore, withState } from '@ngrx/signals';
import type { PokerState, Room, User } from './poker.models';
import { withPokerSelectors } from './poker-selectors.feature';

const room: Room = {
  id: 'room',
  name: 'Room',
  reveal: true,
  autoReveal: false,
  useMultiplier: true,
  multiplierValue: 1.5,
  theme: 'default',
  lobbyEnabled: true,
  issuesEnabled: true,
  mood: 'playful',
  roundClock: null,
};
const player = (id: string, extra: Partial<User> = {}): User => ({
  id,
  name: id,
  isObserver: false,
  isApproved: true,
  ...extra,
});

const SelectorsStore = signalStore(
  { protectedState: false },
  withState<PokerState>({
    currentUser: null,
    currentRoom: room,
    users: [],
    resultSnapshot: null,
    revealState: true,
    isCountdown: false,
    countdownValue: 0,
    healthStatus: null,
    isConnected: true,
    webVersion: 'Development',
    apiVersion: 'Unknown',
  }),
  withPokerSelectors(),
);

describe('withPokerSelectors', () => {
  function setup(users: User[], resultSnapshot: string | null = null) {
    TestBed.configureTestingModule({ providers: [SelectorsStore] });
    const store = TestBed.inject(SelectorsStore);
    patchState(store, { users, resultSnapshot });
    return store;
  }
  afterEach(() => TestBed.resetTestingModule());

  it('splits approved players, observers and pending users', () => {
    const store = setup([
      player('p'),
      player('o', { isObserver: true }),
      player('n', { isApproved: false }),
    ]);
    expect(store.players().map((u) => u.id)).toEqual(['p']);
    expect(store.observers().map((u) => u.id)).toEqual(['o']);
    expect(store.pendingApprovals().map((u) => u.id)).toEqual(['n']);
  });

  it('averages revealed numeric votes and applies the room multiplier', () => {
    const store = setup([
      player('a', { vote: '3' }),
      player('b', { vote: '5' }),
      player('c', { vote: '?' }),
    ]);
    expect(store.averageVote()).toBe('4.0');
    expect(store.multipliedAverage()).toBe('6.0');
    expect(store.isPerfectMatch()).toBe(false);
  });

  it('fills missing live votes from the reveal snapshot', () => {
    const store = setup(
      [player('a'), player('b', { vote: '8' })],
      JSON.stringify([{ id: 'a', name: 'a', vote: '5' }]),
    );
    expect(store.mergedPlayers().map((u) => [u.id, u.vote, u.hasVoted])).toEqual([
      ['a', '5', true],
      ['b', '8', undefined],
    ]);
  });

  it('passes status labels through as display versions', () => {
    const store = setup([]);
    expect(store.formattedWebVersion()).toBe('Development');
    expect(store.formattedApiVersion()).toBe('Unknown');
  });
});
