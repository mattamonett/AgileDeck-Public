// The development build defines this to reach the separate local API server.
declare const LOCAL_API_ORIGIN: string | undefined;

/** Production builds are served with the API proxied on the same origin. */
export function resolveApiUrl(): string {
  return typeof LOCAL_API_ORIGIN !== 'undefined' ? LOCAL_API_ORIGIN : window.location.origin;
}
