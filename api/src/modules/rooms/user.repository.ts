import prisma from '../../platform/db/prisma';
import type { ObserverPreference, User, Prisma } from '@prisma/client';
import { consumeDailyQuotas, type DailyQuota } from '../../platform/db/abuse-quota';
import { roomNameKey } from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';

/** Daily budgets for identities the site has not seen before. */
function newVisitorQuotas(network: string): DailyQuota[] {
  const quota = getSiteConfig().limits.daily.newVisitors;
  return [
    { scope: 'register-network', identity: network, limit: quota.perNetwork },
    { scope: 'register-global', identity: 'all', limit: quota.perSite },
  ];
}

/** Stores an acceptance; a new one from a network uses the new-visitor budgets. */
export async function saveVisitorAgreement(
  tx: Prisma.TransactionClient,
  data: Prisma.VisitorAgreementCreateInput,
  network?: string,
): Promise<void> {
  const where = {
    visitorId_version: { visitorId: data.visitorId, version: data.version },
  };
  if (network && !(await tx.visitorAgreement.findUnique({ where })))
    await consumeDailyQuotas(tx, newVisitorQuotas(network));
  await tx.visitorAgreement.upsert({ where, create: data, update: {} });
}

/**
 * True when anything is stored for this browser ID: a membership, an
 * approval, feedback access or an agreement record.
 */
async function isKnownVisitor(tx: Prisma.TransactionClient, visitorId: string): Promise<boolean> {
  const where = { visitorId };
  const select = { visitorId: true } as const;
  const found = await Promise.all([
    tx.user.findFirst({ where, select }),
    tx.roomApproval.findFirst({ where, select }),
    tx.feedbackAccess.findUnique({ where, select }),
    tx.visitorAgreement.findFirst({ where, select }),
  ]);
  return found.some((row) => row !== null);
}

/**
 * Sites that ask for no agreement store no acceptance, so the new-visitor
 * budgets are charged when an unknown browser ID first creates or joins a
 * room instead.
 * Without this, fresh cookies could add members without any network limit.
 */
export async function chargeNewVisitor(
  tx: Prisma.TransactionClient,
  visitorId: string,
  network: string,
): Promise<void> {
  if (!(await isKnownVisitor(tx, visitorId)))
    await consumeDailyQuotas(tx, newVisitorQuotas(network));
}

/** Quotas are charged in the same transaction, so a refused request writes nothing. */
export async function create(
  data: Prisma.UserCreateInput,
  network?: string,
  quotas: readonly DailyQuota[] = [],
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    await consumeDailyQuotas(tx, quotas);
    if (network && !data.agreementVersion) await chargeNewVisitor(tx, data.visitorId, network);
    const user = await tx.user.create({ data });
    if (user.agreementVersion && user.agreementText && user.agreementAcceptedAt) {
      await saveVisitorAgreement(
        tx,
        {
          visitorId: user.visitorId,
          version: user.agreementVersion,
          text: user.agreementText,
          acceptedAt: user.agreementAcceptedAt,
        },
        network,
      );
    }
    if (user.isApproved) await saveApproval(tx, user);
    return user;
  });
}

async function saveApproval(tx: Prisma.TransactionClient, user: User): Promise<void> {
  const identity = { roomId: user.roomId, visitorId: user.visitorId };
  const details = {
    lastKnownName: user.name,
    lastIsObserver: user.isObserver,
    lastJoinedAt: user.createdAt,
  };
  await tx.roomApproval.upsert({
    where: { roomId_visitorId: identity },
    create: { ...identity, ...details },
    update: details,
  });
  await tx.feedbackAccess.upsert({
    where: { visitorId: user.visitorId },
    create: { visitorId: user.visitorId },
    update: {},
  });
}

export async function hasRoomApproval(roomId: string, visitorId: string): Promise<boolean> {
  const approval = await prisma.roomApproval.findUnique({
    where: { roomId_visitorId: { roomId, visitorId } },
    select: { visitorId: true },
  });
  return approval !== null;
}

/** True when this visitor owns an approved membership with this user ID in the room. */
export async function isApprovedMember(
  roomId: string,
  userId: string,
  visitorId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const member = await db.user.findFirst({
    where: { roomId, id: userId, visitorId, isApproved: true },
    select: { id: true },
  });
  return member !== null;
}

/**
 * True when another member, current or remembered from an earlier approval,
 * already uses this name in the room, so a newcomer cannot pass as them.
 */
export async function isNameTaken(
  roomId: string,
  name: string,
  visitorId: string,
): Promise<boolean> {
  const others = { roomId, visitorId: { not: visitorId } };
  const [users, approvals] = await Promise.all([
    prisma.user.findMany({ where: others, select: { name: true } }),
    prisma.roomApproval.findMany({
      where: { ...others, lastKnownName: { not: null } },
      select: { lastKnownName: true },
    }),
  ]);
  const key = roomNameKey(name);
  return [
    ...users.map((user) => user.name),
    ...approvals.flatMap((approval) => approval.lastKnownName ?? []),
  ].some((taken) => roomNameKey(taken) === key);
}

export async function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function findByRoomId(roomId: string): Promise<User[]> {
  return prisma.user.findMany({ where: { roomId } });
}

export async function findByVisitorIdInRoom(
  roomId: string,
  visitorId: string,
): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      roomId_visitorId: {
        roomId,
        visitorId,
      },
    },
  });
}

export async function findObserverPreference(
  roomId: string,
  visitorId: string,
): Promise<ObserverPreference | null> {
  return prisma.observerPreference.findUnique({
    where: {
      roomId_visitorId: {
        roomId,
        visitorId,
      },
    },
  });
}

export async function countByRoomId(roomId: string, isApproved?: boolean): Promise<number> {
  return prisma.user.count({
    where: { roomId, ...(isApproved === undefined ? {} : { isApproved }) },
  });
}

export async function update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
  if (data.isApproved === true || data.name !== undefined) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data });
      if (user.isApproved) await saveApproval(tx, user);
      return user;
    });
  }
  return prisma.user.update({ where: { id }, data });
}

export async function updateObserverStatus(id: string, isObserver: boolean): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: isObserver ? { isObserver: true, vote: null } : { isObserver: false },
    });

    if (user.isApproved) await saveApproval(tx, user);
    await tx.observerPreference.upsert({
      where: {
        roomId_visitorId: {
          roomId: user.roomId,
          visitorId: user.visitorId,
        },
      },
      create: {
        roomId: user.roomId,
        visitorId: user.visitorId,
        isObserver,
      },
      update: { isObserver },
    });

    return user;
  });
}

export async function updateMany(
  where: Prisma.UserWhereInput,
  data: Prisma.UserUpdateInput,
): Promise<Prisma.BatchPayload> {
  return prisma.user.updateMany({ where, data });
}

async function deleteById(id: string): Promise<User> {
  return prisma.user.delete({ where: { id } });
}

export async function deleteMany(where: Prisma.UserWhereInput): Promise<Prisma.BatchPayload> {
  return prisma.user.deleteMany({ where });
}

export { deleteById as delete };
