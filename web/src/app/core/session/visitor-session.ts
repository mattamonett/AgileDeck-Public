import { ApiPath } from '@poker/shared';

/** Asks the API for the signed visitor cookie that sessions, access and admin cookies bind to. */
export function requestVisitorSession(apiUrl: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl + ApiPath.INIT, { ...init, credentials: 'include', cache: 'no-store' });
}
