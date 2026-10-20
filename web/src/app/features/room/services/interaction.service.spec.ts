import { TestBed } from '@angular/core/testing';
import { GameEvents } from '@poker/shared';
import { InteractionService } from './interaction.service';
import { SocketService } from '@core/socket/socket.service';

describe('InteractionService', () => {
  function setup() {
    const listeners = new Map<string, (data: unknown) => void>();
    const socket = {
      on: vi.fn((event: string, callback: (data: unknown) => void) =>
        listeners.set(event, callback),
      ),
      off: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SocketService, useValue: { getSocket: () => socket } }],
    });
    const service = TestBed.inject(InteractionService);
    return {
      service,
      socket,
      emit: (event: string, data: unknown) => listeners.get(event)?.(data),
    };
  }
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('rejects malformed interactions without scheduling work', () => {
    vi.useFakeTimers();
    const { service, emit } = setup();
    for (const event of [
      GameEvents.NUDGED,
      GameEvents.PROJECTILE_THROWN,
      GameEvents.PROJECTILE_BARRAGE,
    ]) {
      emit(event, null);
      emit(event, {});
    }
    expect(service.thrownProjectiles()).toEqual([]);
    expect(service.nudgedUserId()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires nudges and removes listeners and pending work on destruction', () => {
    vi.useFakeTimers();
    const { service, socket, emit } = setup();
    emit(GameEvents.NUDGED, { targetUserId: 'user' });
    expect(service.lastNudge()).toBeNull();
    emit(GameEvents.NUDGED, { targetUserId: 'user', sourceUserId: 'pat', level: 2 });
    expect(service.nudgedUserId()).toBe('user');
    expect(service.lastNudge()).toEqual({
      event: { targetUserId: 'user', sourceUserId: 'pat', level: 2 },
      seq: 1,
    });
    expect(service.nudgeCooldowns().get('user')).toBe(15);
    vi.advanceTimersByTime(3000);
    expect(service.nudgedUserId()).toBeNull();
    expect(service.nudgeCooldowns().get('user')).toBe(12);
    vi.advanceTimersByTime(12_000);
    expect(service.nudgeCooldowns().size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    emit(GameEvents.PROJECTILE_BARRAGE, {
      sourceUserId: 'source',
      targetUserId: 'target',
      emoji: '📄',
    });
    expect(vi.getTimerCount()).toBe(20);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.off).toHaveBeenCalledTimes(3);
  });
});
