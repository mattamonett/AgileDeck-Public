import { GameEvents, NAME_TAKEN_JOIN_MESSAGE, type SiteAgreementAcceptance } from '@poker/shared';
import { Prisma } from '@prisma/client';
import type { Room, User } from '@prisma/client';
import { ipKeyGenerator } from 'express-rate-limit';
import { getSiteConfig, type SiteAgreement } from '../../config/site-config';
import { AbuseLimitError, type DailyQuota } from '../../platform/db/abuse-quota';
import {
  acceptsCurrentAgreement,
  agreementRecord,
  requiredAgreement,
} from '../site/site-agreement';
import { recordUsage } from '../telemetry/usage-telemetry';
import { reconcileRoomUsers } from './reconcile-users';
import {
  JoinRejectedError,
  SiteAgreementRequiredError,
  SitePasswordRequiredError,
} from './room-errors';
import { withRoomLock } from './room-lock';
import {
  broadcastUserUpdate,
  currentBroadcaster,
  requireBroadcaster,
  revelationService,
  userCleanupService,
} from './room-runtime';
import * as roomRepository from './room.repository';
import * as userRepository from './user.repository';
import { logger } from '../../platform/logger';

export const PENDING_REQUEST_TTL_MS = 5 * 60_000;
/** Requests that may wait in one room's lobby at once. */
export const MAX_PENDING_REQUESTS = 10;

interface JoinRequest {
  readonly roomId: string;
  readonly userName: string;
  readonly visitorId: string;
  readonly createRoomIntent: boolean;
  readonly siteAgreement: SiteAgreementAcceptance | undefined;
  readonly clientIp: string;
  readonly mayCreateRoom: boolean;
}

interface FoundRoom {
  readonly room: Room;
  readonly roomWasCreated: boolean;
  readonly acceptedAgreement: SiteAgreement | null;
}

/**
 * The agreement to store with a new membership or room: the current one, which
 * the visitor must have accepted, or null when the site asks for none.
 */
function requireSiteAgreement(
  agreement: SiteAgreementAcceptance | undefined,
): SiteAgreement | null {
  if (!acceptsCurrentAgreement(agreement)) throw new SiteAgreementRequiredError();
  return requiredAgreement();
}

/**
 * Join requests per room per day (limits.daily.joinRequests). Expired and
 * denied requests cannot simply be repeated, so one person or network cannot
 * keep a room's lobby full; an office joining together still fits within the
 * network budget.
 */
function lobbyQuotas(roomId: string, visitorId: string, network: string): DailyQuota[] {
  const quota = getSiteConfig().limits.daily.joinRequests;
  return [
    {
      scope: 'lobby-visitor',
      identity: `${roomId}:${visitorId}`,
      limit: quota.perVisitor,
    },
    {
      scope: 'lobby-network',
      identity: `${roomId}:${network}`,
      limit: quota.perNetwork,
    },
  ];
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function isPendingRequestExpired(user: User): boolean {
  return user.createdAt.getTime() + PENDING_REQUEST_TTL_MS <= Date.now();
}

/** Serialized per room so concurrent joins cannot create duplicate users. */
export async function joinRoom(
  roomId: string,
  userName: string,
  visitorId: string,
  createRoomIntent: boolean = false,
  siteAgreement?: SiteAgreementAcceptance,
  clientIp = 'unknown',
  mayCreateRoom = true,
): Promise<{ user: User; room: Room }> {
  const normalizedRoomId = roomId.toLowerCase();
  return withRoomLock(normalizedRoomId, () =>
    joinRoomWithinLock({
      roomId: normalizedRoomId,
      userName,
      visitorId,
      createRoomIntent,
      siteAgreement,
      clientIp,
      mayCreateRoom,
    }),
  );
}

async function joinRoomWithinLock(request: JoinRequest): Promise<{ user: User; room: Room }> {
  const { roomId, userName, visitorId } = request;
  const { room, roomWasCreated, acceptedAgreement } = await findOrCreateRoom(request);
  await expirePendingRequests(roomId);
  const existing =
    (await reconcileRoomUsers(currentBroadcaster(), roomId, visitorId)) ??
    (await userRepository.findByVisitorIdInRoom(roomId, visitorId));
  const agreement = existing ? acceptedAgreement : await admitNewcomer(request, roomWasCreated);

  if (
    !roomWasCreated &&
    existing?.name !== userName &&
    (await userRepository.isNameTaken(roomId, userName, visitorId))
  )
    throw new JoinRejectedError(NAME_TAKEN_JOIN_MESSAGE);

  // Touch the room's updatedAt only after the join has passed admission checks.
  if (!roomWasCreated) {
    await roomRepository.update(roomId, { updatedAt: new Date() });
  }

  const user = existing
    ? await admitExistingMember(existing, userName)
    : await createMembership(request, roomWasCreated, agreement);

  userCleanupService().cancelPendingUserCleanup(user.id, roomId);
  await broadcastUserUpdate(roomId);
  requireBroadcaster().emitToRoom(roomId, GameEvents.REVEAL_STATE, room.reveal);
  await revelationService().checkAutoReveal(roomId);

  return { user, room };
}

async function findOrCreateRoom(request: JoinRequest): Promise<FoundRoom> {
  const { roomId, visitorId } = request;
  const room = await roomRepository.findById(roomId);
  if (room) return { room, roomWasCreated: false, acceptedAgreement: null };

  if (!request.createRoomIntent) {
    throw new JoinRejectedError(
      `Room '${roomId}' not found. Please check the URL or create a new room.`,
    );
  }
  if (!request.mayCreateRoom) throw new SitePasswordRequiredError();
  const acceptedAgreement = requireSiteAgreement(request.siteAgreement);
  try {
    const created = await roomRepository.create(
      {
        id: roomId,
        name: 'Room ' + roomId,
        theme: getSiteConfig().content.defaultTheme,
        lobbyEnabled: true,
        mood: getSiteConfig().content.defaultMood,
        roundStartedAt: new Date(),
      },
      {
        visitorId,
        network: ipKeyGenerator(request.clientIp),
        agreement: acceptedAgreement,
      },
    );
    recordUsage('room.created');
    return { room: created, roomWasCreated: true, acceptedAgreement };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Someone else created the room between the lookup and the insert.
    const raced = await roomRepository.findById(roomId);
    if (!raced) throw err;
    return { room: raced, roomWasCreated: false, acceptedAgreement };
  }
}

/** Removes lobby requests nobody answered in time and drops their sockets. */
async function expirePendingRequests(roomId: string): Promise<void> {
  const expired = await userRepository.deleteMany({
    roomId,
    isApproved: false,
    createdAt: { lt: new Date(Date.now() - PENDING_REQUEST_TTL_MS) },
  });
  if (expired.count === 0) return;
  const users = await userRepository.findByRoomId(roomId);
  const ids = new Set(users.map((user) => user.id));
  for (const socket of await requireBroadcaster().memberSockets(roomId))
    if (socket.userId && !ids.has(socket.userId)) socket.disconnect();
}

/** Checks room capacity for a new visitor, then the agreement they accepted. */
async function admitNewcomer(
  request: JoinRequest,
  roomWasCreated: boolean,
): Promise<SiteAgreement | null> {
  const { roomId, visitorId } = request;
  const approved = roomWasCreated || (await userRepository.hasRoomApproval(roomId, visitorId));
  const userCount = await userRepository.countByRoomId(roomId, approved);
  const maxUsers = getSiteConfig().limits.maxUsersPerRoom;
  if (userCount >= (approved ? maxUsers : MAX_PENDING_REQUESTS))
    throw new JoinRejectedError(
      approved
        ? `Room is full (Max ${maxUsers} players)`
        : `Room is full (Max ${MAX_PENDING_REQUESTS} pending requests)`,
    );
  return requireSiteAgreement(request.siteAgreement);
}

async function admitExistingMember(user: User, userName: string): Promise<User> {
  if (user.name === userName) return user;
  return userRepository.update(user.id, { name: userName });
}

async function createMembership(
  request: JoinRequest,
  roomWasCreated: boolean,
  agreement: SiteAgreement | null,
): Promise<User> {
  const { roomId, visitorId } = request;
  try {
    const observerPreference = await userRepository.findObserverPreference(roomId, visitorId);
    const isApproved = roomWasCreated || (await userRepository.hasRoomApproval(roomId, visitorId));
    const network = ipKeyGenerator(request.clientIp);
    return await userRepository.create(
      {
        name: request.userName,
        room: { connect: { id: roomId } },
        visitorId,
        isApproved,
        isObserver: observerPreference?.isObserver ?? false,
        ...(agreement ? agreementRecord(agreement) : {}),
      },
      // Room creation already charged a new creator's new-visitor budgets.
      roomWasCreated ? undefined : network,
      isApproved ? [] : lobbyQuotas(roomId, visitorId, network),
    );
  } catch (err) {
    if (err instanceof AbuseLimitError)
      throw new JoinRejectedError(
        'Too many requests to join this room today. Please try again tomorrow.',
      );
    if (!isUniqueViolation(err)) {
      logger.error('Unexpected error in userRepository.create:', err);
      throw err;
    }
    const existing = await userRepository.findByVisitorIdInRoom(roomId, visitorId);
    if (!existing) throw err;
    return existing;
  }
}
