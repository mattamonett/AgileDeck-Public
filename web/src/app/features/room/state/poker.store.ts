import { inject, DestroyRef } from '@angular/core';
import {
  patchState,
  signalStore,
  signalStoreFeature,
  type,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { HealthStatus, PokerState, Room, User } from './poker.models';
import { withPokerSelectors } from './poker-selectors.feature';
import { withPokerSocketSync } from './poker-socket-sync.feature';

export type { HealthStatus, PokerState, Room, User } from './poker.models';

// Initial state
const initialState: PokerState = {
  currentUser: null,
  currentRoom: null,
  users: [],
  resultSnapshot: null,
  revealState: false,
  isCountdown: false,
  countdownValue: 0,
  healthStatus: null,
  isConnected: false,
  webVersion: '',
  apiVersion: '',
};

const byId = (users: User[]): User[] => Array.from(new Map(users.map((u) => [u.id, u])).values());

/** State changes, including the reveal countdown and health-check timers. */
function withPokerMethods() {
  return signalStoreFeature(
    { state: type<PokerState>() },
    withMethods((store) => {
      const destroyRef = inject(DestroyRef);
      let countdownInterval: ReturnType<typeof setInterval> | null = null;
      let healthTimeout: ReturnType<typeof setTimeout> | null = null;

      function clearCountdown() {
        if (countdownInterval !== null) clearInterval(countdownInterval);
        countdownInterval = null;
      }
      destroyRef.onDestroy(() => {
        clearCountdown();
        if (healthTimeout !== null) clearTimeout(healthTimeout);
      });
      return {
        setCurrentUser(user: User | null) {
          patchState(store, { currentUser: user });
        },
        setCurrentRoom(room: Room | null) {
          patchState(store, { currentRoom: room });
        },
        startRoundClock(now = Date.now()) {
          const room = store.currentRoom();
          if (!room) return;
          patchState(store, {
            currentRoom: { ...room, roundClock: { startedAt: now, stoppedAt: null } },
          });
        },
        setUsers(users: User[]) {
          const uniqueUsers = byId(users);
          patchState(store, { users: uniqueUsers });
          // Also update currentUser if present
          const current = store.currentUser();
          if (current) {
            const updated = uniqueUsers.find((u) => u.id === current.id);
            if (updated) {
              patchState(store, { currentUser: updated });
            }
          }
        },
        setRevealState(reveal: boolean) {
          patchState(store, { revealState: reveal });
          if (reveal) {
            clearCountdown();
            patchState(store, { isCountdown: false, countdownValue: 0 });
          } else {
            patchState(store, { resultSnapshot: null });
          }
          const room = store.currentRoom();
          if (room) {
            patchState(store, { currentRoom: { ...room, reveal } });
          }
        },
        startCountdown(seconds: number) {
          clearCountdown();
          patchState(store, { isCountdown: true, countdownValue: Math.ceil(seconds) });
          countdownInterval = setInterval(() => {
            const countdownValue = Math.max(0, store.countdownValue() - 1);
            patchState(store, { countdownValue });
            if (countdownValue === 0) clearCountdown();
          }, 1000);
        },
        decrementCountdown() {
          const current = store.countdownValue();
          if (current <= 1) {
            patchState(store, { countdownValue: 0 });
          } else {
            patchState(store, { countdownValue: current - 1 });
          }
        },
        resetCountdown() {
          clearCountdown();
          patchState(store, { isCountdown: false, countdownValue: 0, resultSnapshot: null });
        },
        setHealthStatus(status: HealthStatus) {
          if (healthTimeout) {
            clearTimeout(healthTimeout);
            healthTimeout = null;
          }
          patchState(store, { healthStatus: { ...status, timestamp: new Date().toISOString() } });
        },
        clearHealthStatus() {
          patchState(store, { healthStatus: null });

          if (healthTimeout) clearTimeout(healthTimeout);

          healthTimeout = setTimeout(() => {
            if (store.healthStatus() === null) {
              patchState(store, {
                healthStatus: {
                  api: 'unhealthy',
                  db: 'unhealthy',
                  timestamp: new Date().toISOString(),
                },
              });
            }
            healthTimeout = null;
          }, 5000);
        },
        setConnected(isConnected: boolean) {
          patchState(store, { isConnected });
        },
        setResultSnapshot(resultSnapshot: string | null) {
          patchState(store, { resultSnapshot });
        },
        setVersions(web: string, api: string) {
          patchState(store, { webVersion: web, apiVersion: api });
        },
      };
    }),
  );
}

// Signal Store
export const PokerStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withPokerSelectors(),

  withPokerMethods(),
  withPokerSocketSync(),
);
