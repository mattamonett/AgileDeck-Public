import { withRoomLock } from './room-lock';
import * as roomRepository from './room.repository';
import * as userRepository from './user.repository';
import * as memberService from './member.service';

interface RoundUpdates {
  isRevealPending(roomId: string): boolean;
  broadcastUserUpdate(roomId: string): Promise<void>;
  checkAutoReveal(roomId: string): Promise<void>;
}

/** Checks current membership and round state inside the same lock as reset/reveal. */
export async function castVote(
  roomId: string,
  userId: string,
  vote: string | null,
  updates: RoundUpdates,
): Promise<void> {
  await withRoomLock(roomId, async () => {
    const user = await userRepository.findById(userId);
    const room = await roomRepository.findById(roomId);
    if (
      !user ||
      user.roomId !== roomId ||
      !user.isApproved ||
      user.isObserver ||
      !room ||
      room.reveal
    )
      return;
    // Recheck membership and round state inside the transition lock.
    // A vote cannot be cleared while the reveal countdown runs.
    if (!vote && updates.isRevealPending(roomId)) {
      return;
    }

    await memberService.setVote(userId, vote);
    await updates.broadcastUserUpdate(roomId);

    if (vote) {
      await updates.checkAutoReveal(roomId);
    }
  });
}
