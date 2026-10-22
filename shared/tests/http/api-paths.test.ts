import { ApiPath, roomApiPath } from '../../src/http/api-paths';

describe('API paths', () => {
  it('uses stable route prefixes', () => {
    expect(Object.values(ApiPath)).toEqual([
      '/api/init',
      '/api/version',
      '/api/site-config',
      '/api/config',
      '/api/access',
      '/api/admin',
      '/api/rooms',
      '/api/feedback',
    ]);
  });

  it('encodes the room ID in room resource paths', () => {
    expect(roomApiPath('abc', 'issues')).toBe('/api/rooms/abc/issues');
    expect(roomApiPath('a/b c', 'stats')).toBe('/api/rooms/a%2Fb%20c/stats');
  });
});
