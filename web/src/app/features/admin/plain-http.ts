const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** On such a page the admin password and cookie cross the network unencrypted. */
export function isPlainHttpBeyondThisComputer(
  location: Pick<Location, 'protocol' | 'hostname'>,
): boolean {
  return location.protocol === 'http:' && !LOOPBACK_HOSTS.has(location.hostname);
}
