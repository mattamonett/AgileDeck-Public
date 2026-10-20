import prisma from '../../platform/db/prisma';
import type { Room, Prisma } from '@prisma/client';
import { AbuseLimitError, consumeDailyQuotas } from '../../platform/db/abuse-quota';
import { getSiteConfig } from '../../config/site-config';
import { chargeNewVisitor, saveVisitorAgreement } from './user.repository';

export interface RoomCreator {
  readonly visitorId: string;
  readonly network: string;
  /** The agreement the creator accepted, or null when the site asks for none. */
  readonly agreement: {
    readonly version: string;
    readonly text: string;
  } | null;
}

export async function create(data: Prisma.RoomCreateInput, creator?: RoomCreator): Promise<Room> {
  if (creator)
    return prisma.$transaction(async (tx) => {
      const { limits } = getSiteConfig();
      const quota = limits.daily.roomsCreated;
      await consumeDailyQuotas(tx, [
        {
          scope: 'create-visitor',
          identity: creator.visitorId,
          limit: quota.perVisitor,
        },
        {
          scope: 'create-network',
          identity: creator.network,
          limit: quota.perNetwork,
        },
        { scope: 'create-global', identity: 'all', limit: quota.perSite },
      ]);
      if ((await tx.room.count()) >= limits.maxRooms)
        throw new AbuseLimitError('Room capacity reached. Please try again later.');
      // New creators use the new-visitor budgets here, before the room exists.
      if (creator.agreement)
        await saveVisitorAgreement(
          tx,
          {
            visitorId: creator.visitorId,
            version: creator.agreement.version,
            text: creator.agreement.text,
            acceptedAt: new Date(),
          },
          creator.network,
        );
      else await chargeNewVisitor(tx, creator.visitorId, creator.network);
      return tx.room.create({ data });
    });
  return prisma.room.create({ data });
}

export async function findById(id: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { id } });
}

export async function update(id: string, data: Prisma.RoomUpdateInput): Promise<Room> {
  return prisma.room.update({ where: { id }, data });
}

async function deleteById(id: string): Promise<Room> {
  return prisma.room.delete({ where: { id } });
}

export { deleteById as delete };
