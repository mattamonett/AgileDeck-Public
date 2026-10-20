import { GameEvents } from '@poker/shared';
import { createRoomBroadcaster } from '../../../src/socket/socket-room-broadcaster';
import type { PokerServer } from '../../../src/socket/types';

function fakeSocket(id: string, roomId: string | null, userId: string | null) {
  return {
    id,
    data: { roomId, userId, visitorId: `visitor-${id}` },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  };
}

describe('Socket.IO room broadcaster', () => {
  const approved = fakeSocket('a', 'room-1', 'user-a');
  const pending = fakeSocket('p', 'room-1', 'user-p');
  const roomEmit = jest.fn();
  const fetchRoom = jest.fn().mockResolvedValue([approved]);
  const fetchMembers = jest.fn().mockResolvedValue([approved, pending]);
  const io = {
    to: jest.fn(() => ({ emit: roomEmit })),
    in: jest.fn((channel: string | string[]) => ({
      fetchSockets: Array.isArray(channel) ? fetchMembers : fetchRoom,
    })),
    fetchSockets: jest.fn().mockResolvedValue([approved, pending]),
    sockets: { sockets: new Map([['a', approved]]) },
  };
  // The fake implements only the server surface the broadcaster calls.
  const broadcaster = createRoomBroadcaster(io as unknown as PokerServer);

  it('emits room-wide events to the approved room channel', () => {
    broadcaster.emitToRoom('room-1', GameEvents.REVEAL_STATE, true);
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(roomEmit).toHaveBeenCalledWith(GameEvents.REVEAL_STATE, true);
  });

  it('looks up approved, member, all and local sockets through the right channels', async () => {
    expect((await broadcaster.approvedSockets('room-1')).map((s) => s.id)).toEqual(['a']);
    expect(io.in).toHaveBeenLastCalledWith('room-1');
    expect((await broadcaster.memberSockets('room-1')).map((s) => s.id)).toEqual(['a', 'p']);
    expect(io.in).toHaveBeenLastCalledWith(['room-1', 'lobby:room-1']);
    expect((await broadcaster.allSockets()).map((s) => s.id)).toEqual(['a', 'p']);
    expect(broadcaster.localSockets().map((s) => s.id)).toEqual(['a']);
  });

  it('reads and writes live socket data and forwards socket actions', async () => {
    const [member] = await broadcaster.memberSockets('room-1');
    if (!member) throw new Error('missing member');
    expect(member).toMatchObject({ roomId: 'room-1', visitorId: 'visitor-a' });
    approved.data.roomId = 'room-2';
    expect(member.roomId).toBe('room-2');
    member.userId = 'user-z';
    expect(approved.data.userId).toBe('user-z');

    member.emit(GameEvents.ERROR, 'message');
    expect(approved.emit).toHaveBeenCalledWith(GameEvents.ERROR, 'message');
    member.disconnect();
    expect(approved.disconnect).toHaveBeenCalledWith(true);
    member.admitToRoom('room-1');
    expect(approved.leave).toHaveBeenCalledWith('lobby:room-1');
    expect(approved.join).toHaveBeenCalledWith('room-1');
    expect(approved.leave.mock.invocationCallOrder[0]).toBeLessThan(
      approved.join.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
