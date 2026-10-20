/** Read-only room and member lookups for socket handlers and routes. */
export { findById as findRoom } from './room.repository';
export {
  findById as findMember,
  findByRoomId as listRoomMembers,
  isApprovedMember,
  isNameTaken,
} from './user.repository';
