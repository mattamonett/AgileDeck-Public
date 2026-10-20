import { z } from 'zod';
import { JoinRoomSchema } from '../room/commands';
import { RoomMoodSchema } from '../room/mood';

export const ADMIN_ROOM_PAGE_SIZE = 50;
export const AdminRoomIdSchema = JoinRoomSchema.shape.roomId;
export const AdminSortDirectionSchema = z.enum(['asc', 'desc']);
export const AdminRoomSortSchema = z.enum([
  'name',
  'approvedMemberCount',
  'memberCount',
  'issueCount',
  'lastActivityAt',
  'createdAt',
]);
export const AdminUserSortSchema = z.enum([
  'name',
  'isObserver',
  'isApproved',
  'createdAt',
  'rateLimitCount',
  'lastRateLimitAt',
]);
export const AdminApprovalSortSchema = z.enum([
  'name',
  'isCurrent',
  'isObserver',
  'isApproved',
  'createdAt',
  'rateLimitCount',
  'lastRateLimitAt',
]);
export type AdminRoomSort = z.infer<typeof AdminRoomSortSchema>;
export type AdminUserSort = z.infer<typeof AdminUserSortSchema>;
export type AdminApprovalSort = z.infer<typeof AdminApprovalSortSchema>;
export type AdminSortDirection = z.infer<typeof AdminSortDirectionSchema>;
export const AdminRoomMemberQuerySchema = z.strictObject({
  memberSort: AdminUserSortSchema.optional(),
  memberDirection: AdminSortDirectionSchema.optional(),
  approvedSort: AdminApprovalSortSchema.optional(),
  approvedDirection: AdminSortDirectionSchema.optional(),
  approvedOffset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  cursor: z.uuid().optional(),
});
export const AdminRoomQuerySchema = z.strictObject({
  sort: AdminRoomSortSchema.optional(),
  direction: AdminSortDirectionSchema.optional(),
  cursor: AdminRoomIdSchema.optional(),
});
export const AdminRoomSchema = z.strictObject({
  id: AdminRoomIdSchema,
  name: z.string().nullable(),
  theme: z.string(),
  mood: RoomMoodSchema,
  approvedMemberCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  lastActivityAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type AdminRoom = z.infer<typeof AdminRoomSchema>;
export const AdminRoomPageSchema = z.strictObject({
  items: z.array(AdminRoomSchema).max(ADMIN_ROOM_PAGE_SIZE),
  nextCursor: AdminRoomIdSchema.nullable(),
});
export const AdminRoomUserSchema = z.strictObject({
  memberReference: z.string().min(1).max(1024),
  rateLimitCount: z.number().int().nonnegative(),
  lastRateLimitAt: z.iso.datetime().nullable(),
  id: z.uuid(),
  name: z.string(),
  isObserver: z.boolean(),
  isApproved: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminRoomUser = z.infer<typeof AdminRoomUserSchema>;
export const AdminApprovedMemberSchema = z.strictObject({
  memberReference: z.string().min(1).max(1024),
  isObserver: z.boolean().nullable(),
  isApproved: z.literal(true),
  createdAt: z.iso.datetime().nullable(),
  rateLimitCount: z.number().int().nonnegative(),
  lastRateLimitAt: z.iso.datetime().nullable(),
  name: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type AdminApprovedMember = z.infer<typeof AdminApprovedMemberSchema>;
export const AdminRoomDetailSchema = z.strictObject({
  room: AdminRoomSchema,
  approvedMembers: z.array(AdminApprovedMemberSchema).max(ADMIN_ROOM_PAGE_SIZE),
  nextApprovedOffset: z.number().int().nonnegative().nullable(),
  users: z.array(AdminRoomUserSchema).max(ADMIN_ROOM_PAGE_SIZE),
  nextCursor: z.uuid().nullable(),
});

export const AdminDeleteRoomSchema = z.strictObject({
  name: z.string().max(2000).nullable(),
  approvedMemberCount: z.number().int().nonnegative(),
});
export const AdminDeleteMemberSchema = z.strictObject({
  name: z.string().max(2000).nullable(),
});
export const AdminMemberReferenceSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);
