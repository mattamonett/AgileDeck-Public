import { setVoteWithStats } from './room-stats.repository';
import * as userRepository from './user.repository';
import type { User } from '@prisma/client';

export async function updateName(userId: string, name: string): Promise<User> {
  return userRepository.update(userId, { name });
}

export async function setVote(userId: string, vote: string | null): Promise<User> {
  return setVoteWithStats(userId, vote);
}

export async function toggleObserver(userId: string, isObserver: boolean): Promise<User> {
  return userRepository.updateObserverStatus(userId, isObserver);
}

export async function getById(userId: string): Promise<User | null> {
  return userRepository.findById(userId);
}
