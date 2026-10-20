import { computed } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import { ResultSnapshotSchema } from '@poker/shared';
import type { PokerState, User } from './poker.models';
import { formatVersion, mean, numericVotes } from './vote-selectors';

const isApprovedPlayer = (u: User): boolean => !u.isObserver && u.isApproved;
const isApprovedObserver = (u: User): boolean => u.isObserver && u.isApproved;

/** Derived room state: who is playing, reveal results, averages and display versions. */
export function withPokerSelectors() {
  return signalStoreFeature(
    { state: type<PokerState>() },
    withComputed((store) => ({
      players: computed(() => store.users().filter(isApprovedPlayer)),
      observers: computed(() => store.users().filter(isApprovedObserver)),
      isObserver: computed(() => store.currentUser()?.isObserver || false),
      hasVotes: computed(() =>
        store
          .users()
          .filter(isApprovedPlayer)
          .some((user: User) => user.hasVoted ?? !!user.vote),
      ),
      pendingApprovals: computed(() => store.users().filter((u: User) => !u.isApproved)),

      revealedPlayers: computed(() => {
        const snapshot = store.resultSnapshot();
        if (store.revealState() && snapshot) {
          try {
            const parsed = ResultSnapshotSchema.safeParse(JSON.parse(snapshot));
            if (!parsed.success) return [];

            return parsed.data.map((u) => ({
              id: u.id,
              name: u.name,
              ...(u.vote != null ? { vote: u.vote } : {}),
              isObserver: false,
              isApproved: true, // If they were in the snapshot, they were approved/active
              hasVoted: !!u.vote,
            }));
          } catch {
            return [];
          }
        }
        return [];
      }),
    })),

    withComputed((store) => ({
      mergedPlayers: computed(() => {
        const active = store.players();
        const snapshot = store.revealedPlayers();
        if (!store.revealState() || snapshot.length === 0) return active;

        const snapshotById = new Map(snapshot.map((p) => [p.id, p]));

        return active.map((p) => {
          const revealed = snapshotById.get(p.id);
          if (!revealed) return p;
          const merged = { ...p };
          if (!merged.vote && revealed.vote) {
            merged.vote = revealed.vote;
          }
          if (merged.hasVoted === undefined && revealed.hasVoted !== undefined) {
            merged.hasVoted = revealed.hasVoted;
          }
          return {
            ...merged,
          };
        });
      }),

      averageVote: computed(() => {
        if (!store.revealState()) return 0;
        const average = mean(numericVotes(store.players().map((u: User) => u.vote)));
        return average === null ? 0 : average.toFixed(1);
      }),

      multipliedAverage: computed(() => {
        if (!store.revealState()) return null;
        const average = mean(numericVotes(store.players().map((u: User) => u.vote)));
        if (average === null) return null;

        const room = store.currentRoom();
        if (!room || !room.useMultiplier || average === 0) return null;
        return (average * room.multiplierValue).toFixed(1);
      }),

      isPerfectMatch: computed(() => {
        if (!store.revealState()) return false;

        // Use live users since they contain votes once revealed
        const players = store.players();
        if (players.length === 0) return false;

        const validVotes = players.map((p: User) => p.vote).filter((v: string | undefined) => !!v);
        if (validVotes.length !== players.length) return false;

        return new Set(validVotes).size === 1;
      }),

      formattedWebVersion: computed(() => formatVersion(store.webVersion())),
      formattedApiVersion: computed(() => formatVersion(store.apiVersion())),
    })),
  );
}
