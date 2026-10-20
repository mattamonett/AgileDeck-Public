import { roomNameKey } from '../../src/room/identity';

describe('room identity', () => {
  it('compares room display names without case or spacing', () => {
    expect(roomNameKey(' M att  Smith ')).toBe(roomNameKey('matt smith'));
    expect(roomNameKey('Matt')).not.toBe(roomNameKey('Matt_'));
  });
});
