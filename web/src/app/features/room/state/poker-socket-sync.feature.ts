import { DestroyRef, Injector, inject } from '@angular/core';
import { signalStoreFeature, type, withHooks } from '@ngrx/signals';
import {
  GameEvents,
  JoinedSchema,
  PublicUsersSchema,
  PublicUserSchema,
  PublicRoomSchema,
  HealthStatusSchema,
  RevelationStartedSchema,
  RevealStateSchema,
  NAME_TAKEN_JOIN_MESSAGE,
} from '@poker/shared';
import { AppUpdateService } from '@core/update/app-update.service';
import { SocketService } from '@core/socket/socket.service';
import {
  toRoomView,
  toUserView,
  type HealthStatus,
  type PokerState,
  type Room,
  type User,
} from './poker.models';

/** Parses room socket events and applies them to the store for as long as it lives. */
export function withPokerSocketSync() {
  return signalStoreFeature(
    {
      state: type<PokerState>(),
      // The store methods that socket events drive.
      methods: type<{
        setConnected: (isConnected: boolean) => void;
        setCurrentUser: (user: User | null) => void;
        setCurrentRoom: (room: Room | null) => void;
        setUsers: (users: User[]) => void;
        setRevealState: (reveal: boolean) => void;
        setResultSnapshot: (resultSnapshot: string | null) => void;
        startCountdown: (seconds: number) => void;
        resetCountdown: () => void;
        startRoundClock: () => void;
        setHealthStatus: (status: HealthStatus) => void;
      }>(),
    },
    withHooks({
      onInit(store) {
        const socketService = inject(SocketService);
        const socket = socketService.getSocket();
        const destroyRef = inject(DestroyRef);
        const injector = inject(Injector);
        function listen(event: string, listener: (payload: unknown) => void) {
          socket.on(event, listener);
          destroyRef.onDestroy(() => socket.off(event, listener));
        }

        store.setConnected(socket.connected);
        listen('connect', () => store.setConnected(true));
        listen('disconnect', () => store.setConnected(false));

        listen(GameEvents.JOINED, (payload: unknown) => {
          const parsed = JoinedSchema.safeParse(payload);
          if (!parsed.success) return;
          store.resetCountdown();
          store.setCurrentUser(toUserView(parsed.data.user));
          store.setCurrentRoom(toRoomView(parsed.data.room));
          store.setRevealState(parsed.data.room.reveal);
        });

        listen(GameEvents.UPDATE_USERS, (payload: unknown) => {
          const parsed = PublicUsersSchema.safeParse(payload);
          if (parsed.success) store.setUsers(parsed.data.map(toUserView));
        });

        listen(GameEvents.USER_UPDATED, (payload: unknown) => {
          const parsed = PublicUserSchema.safeParse(payload);
          if (!parsed.success) return;
          const user = toUserView(parsed.data);
          if (store.currentUser()?.id === user.id) {
            store.setCurrentUser(user);
          }
        });

        listen(GameEvents.ROOM_UPDATED, (payload: unknown) => {
          const parsed = PublicRoomSchema.safeParse(payload);
          if (parsed.success) store.setCurrentRoom(toRoomView(parsed.data));
        });

        listen(GameEvents.REVEAL_RESULTS, (resultSnapshot: unknown) => {
          if (typeof resultSnapshot === 'string') store.setResultSnapshot(resultSnapshot);
        });

        listen(GameEvents.REVELATION_STARTED, (payload: unknown) => {
          const parsed = RevelationStartedSchema.safeParse(payload);
          if (parsed.success) store.startCountdown(parsed.data.seconds);
        });

        listen(GameEvents.REVEAL_STATE, (payload: unknown) => {
          const parsed = RevealStateSchema.safeParse(payload);
          if (parsed.success) store.setRevealState(parsed.data);
        });

        // A reset carries no payload: the new round starts now for every client.
        listen(GameEvents.RESET, () => {
          store.resetCountdown();
          store.startRoundClock();
        });

        listen(GameEvents.HEALTH_STATUS, (payload: unknown) => {
          const parsed = HealthStatusSchema.safeParse(payload);
          if (parsed.success) store.setHealthStatus(parsed.data);
        });

        listen(GameEvents.ERROR, (message: unknown) => {
          if (typeof message !== 'string') return;
          console.error('Socket Error:', message);
          void showSocketError(message);
        });

        // A page cached from an earlier deploy can send requests the current API rejects.
        // Reloading into the new build fixes that, so it wins over showing the error.
        async function showSocketError(message: string): Promise<void> {
          if (await injector.get(AppUpdateService).reloadIfUpdateAvailable()) return;
          alert(message);
          if (message === NAME_TAKEN_JOIN_MESSAGE) {
            // Return to the join form with this room filled in so a new name can be chosen.
            const roomId = /^\/room\/([^/]+)/.exec(window.location.pathname)?.[1];
            window.location.href = roomId ? `/?join=${roomId}` : '/';
            return;
          }
          if (
            message.includes('Access Denied') ||
            message.includes('full') ||
            message.includes('Room not found')
          ) {
            window.location.href = '/';
          }
        }
      },
    }),
  );
}
