/**
 * The HTTP API's route prefixes. The API mounts its routers on these and the
 * browser builds request URLs from them, so the two cannot drift apart.
 */
export enum ApiPath {
  INIT = '/api/init',
  VERSION = '/api/version',
  SITE_CONFIG = '/api/site-config',
  SEASONAL_CONFIG = '/api/config',
  ACCESS = '/api/access',
  ADMIN = '/api/admin',
  ROOMS = '/api/rooms',
  FEEDBACK = '/api/feedback',
}

export type RoomApiResource = 'issues' | 'stats';

/** The path of one room's issues or stats, with the room ID safely encoded. */
export function roomApiPath(roomId: string, resource: RoomApiResource): string {
  return `${ApiPath.ROOMS}/${encodeURIComponent(roomId)}/${resource}`;
}
