import { Router } from 'express';
import {
  AdminDeleteMemberSchema,
  AdminDeleteRoomSchema,
  AdminMemberReferenceSchema,
  AdminRoomIdSchema,
  AdminRoomMemberQuerySchema,
  AdminRoomQuerySchema,
} from '@poker/shared';
import { jsonBody, JsonBodyLimit } from '../../../platform/http/json-body';
import { deleteAdminMember, deleteAdminRoom } from '../admin-deletion.service';
import { findAdminRoom, listAdminRooms } from '../room-admin.service';

export function createRoomsRouter(): Router {
  const router = Router();
  router.get('/rooms', async (req, res, next) => {
    const query = AdminRoomQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: 'Invalid room filters.' });
      return;
    }
    try {
      res.json(await listAdminRooms(query.data.cursor, query.data.sort, query.data.direction));
    } catch (error) {
      next(error);
    }
  });
  router.get('/rooms/:id', async (req, res, next) => {
    const id = AdminRoomIdSchema.safeParse(req.params.id);
    const query = AdminRoomMemberQuerySchema.safeParse(req.query);
    if (!id.success || !query.success) {
      res.status(400).json({ message: 'Invalid room reference or member cursor.' });
      return;
    }
    try {
      res.json(
        await findAdminRoom(
          id.data,
          query.data.cursor,
          query.data.approvedOffset,
          query.data.memberSort,
          query.data.memberDirection,
          query.data.approvedSort,
          query.data.approvedDirection,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.delete('/rooms/:id', jsonBody(JsonBodyLimit.COMMAND), async (req, res, next) => {
    const id = AdminRoomIdSchema.safeParse(req.params.id);
    const confirmation = AdminDeleteRoomSchema.safeParse(req.body);
    if (!id.success || !confirmation.success) {
      res.status(400).json({ message: 'Invalid room deletion confirmation.' });
      return;
    }
    try {
      await deleteAdminRoom(id.data, confirmation.data.name, confirmation.data.approvedMemberCount);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.delete(
    '/rooms/:id/members/:reference',
    jsonBody(JsonBodyLimit.COMMAND),
    async (req, res, next) => {
      const id = AdminRoomIdSchema.safeParse(req.params.id);
      const reference = AdminMemberReferenceSchema.safeParse(req.params.reference);
      const confirmation = AdminDeleteMemberSchema.safeParse(req.body);
      if (!id.success || !reference.success || !confirmation.success) {
        res.status(400).json({ message: 'Invalid user deletion confirmation.' });
        return;
      }
      try {
        await deleteAdminMember(id.data, reference.data, confirmation.data.name);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
