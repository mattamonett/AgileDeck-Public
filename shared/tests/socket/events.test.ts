import { GameEvents, SocketEvents } from '../../src/socket/events';

describe('shared event enums', () => {
  it('uses stable socket event names', () => {
    expect(SocketEvents.JOIN_ROOM).toBe('join_room');
    expect(SocketEvents.LEAVE_ROOM).toBe('leave_room');
    expect(SocketEvents.VOTE).toBe('vote');
    expect(SocketEvents.REVEAL).toBe('reveal');
    expect(SocketEvents.RESET).toBe('reset');
    expect(SocketEvents.UPDATE_ROOM_NAME).toBe('update_room_name');
    expect(SocketEvents.TOGGLE_AUTO_REVEAL).toBe('toggle_auto_reveal');
    expect(SocketEvents.UPDATE_MULTIPLIER).toBe('update_multiplier');
    expect(SocketEvents.UPDATE_THEME).toBe('update_theme');
    expect(SocketEvents.UPDATE_USER).toBe('update_user');
    expect(SocketEvents.TOGGLE_OBSERVER).toBe('toggle_observer');
    expect(SocketEvents.NUDGE).toBe('nudge');
    expect(SocketEvents.NUDGE_STRAGGLERS).toBe('nudge_stragglers');
    expect(SocketEvents.THROW_PROJECTILE).toBe('throw_projectile');
    expect(SocketEvents.CHECK_HEALTH).toBe('check_health');
    expect(SocketEvents.DISCONNECT).toBe('disconnect');
  });

  it('uses stable game event names', () => {
    expect(GameEvents.JOINED).toBe('joined');
    expect(GameEvents.ERROR).toBe('error');
    expect(GameEvents.UPDATE_USERS).toBe('update_users');
    expect(GameEvents.REVEAL_STATE).toBe('reveal_state');
    expect(GameEvents.ROOM_UPDATED).toBe('room_updated');
    expect(GameEvents.USER_UPDATED).toBe('user_updated');
    expect(GameEvents.HEALTH_STATUS).toBe('health_status');
    expect(GameEvents.REVELATION_STARTED).toBe('revelation_started');
    expect(GameEvents.REVEAL_RESULTS).toBe('reveal_results');
    expect(GameEvents.NUDGED).toBe('nudged');
    expect(GameEvents.PROJECTILE_THROWN).toBe('projectile_thrown');
  });

  it('contains no duplicate event values', () => {
    const socketValues = Object.values(SocketEvents);
    const gameValues = Object.values(GameEvents);
    expect(new Set(socketValues).size).toBe(socketValues.length);
    expect(new Set(gameValues).size).toBe(gameValues.length);
  });
});
