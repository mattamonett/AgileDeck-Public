import type { Room } from '@prisma/client';
import { PublicRoomSchema, Theme } from '@poker/shared';
import { toPublicRoom } from '../../../src/modules/rooms/public-room';
import { setSiteConfig } from '../../../src/config/site-config';

const now = Date.parse('2026-10-05T12:00:00.000Z');

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room',
    name: 'Room room',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    reveal: false,
    autoReveal: false,
    useMultiplier: false,
    multiplierValue: 1,
    theme: 'default',
    resultSnapshot: null,
    lobbyEnabled: true,
    issuesEnabled: true,
    mood: 'playful',
    statsStartedAt: null,
    roundNumber: 0,
    roundStartedAt: null,
    roundRevealedAt: null,
    roundsRevealed: 0,
    unanimousRounds: 0,
    awardsStartedAt: null,
    ...overrides,
  };
}

describe('round timer', () => {
  it('sends elapsed time for a running round so client clocks do not matter', () => {
    const publicRoom = toPublicRoom(room({ roundStartedAt: new Date(now - 95_000) }), now);
    expect(publicRoom.roundTimer).toEqual({ elapsedMs: 95_000, running: true });
    expect(PublicRoomSchema.safeParse(publicRoom).success).toBe(true);
  });

  it('freezes at the reveal time once cards are revealed', () => {
    const publicRoom = toPublicRoom(
      room({
        reveal: true,
        roundStartedAt: new Date(now - 600_000),
        roundRevealedAt: new Date(now - 420_000),
      }),
      now,
    );
    expect(publicRoom.roundTimer).toEqual({
      elapsedMs: 180_000,
      running: false,
    });
  });

  it('hides the timer until a room has a known round start', () => {
    expect(toPublicRoom(room(), now).roundTimer).toBeNull();
    expect(
      toPublicRoom(room({ reveal: true, roundStartedAt: new Date(now - 1_000) }), now).roundTimer,
    ).toBeNull();
  });

  it('never reports negative time when the server clock steps backwards', () => {
    expect(toPublicRoom(room({ roundStartedAt: new Date(now + 5_000) }), now).roundTimer).toEqual({
      elapsedMs: 0,
      running: true,
    });
  });
});

describe('site issue setting', () => {
  afterEach(() => setSiteConfig());

  it('reports issues as off for every room while the site has them turned off', () => {
    expect(toPublicRoom(room(), now).issuesEnabled).toBe(true);
    setSiteConfig({ features: { issues: false } });
    expect(toPublicRoom(room(), now).issuesEnabled).toBe(false);
  });
});

describe('mood and theme', () => {
  afterEach(() => setSiteConfig());

  it('sends the stored mood and theme while the site allows them', () => {
    const publicRoom = toPublicRoom(room({ mood: 'spicy', theme: 'vegas' }), now);
    expect(publicRoom.mood).toBe('spicy');
    expect(publicRoom.theme).toBe('vegas');
  });

  it("reads a mood or theme the operator has since removed as the site's default", () => {
    setSiteConfig({
      content: {
        moods: ['friendly', 'playful'],
        defaultMood: 'friendly',
        themes: [Theme.SPACE, Theme.RETRO],
        defaultTheme: Theme.SPACE,
      },
    });
    const publicRoom = toPublicRoom(room({ mood: 'spicy', theme: 'vegas' }), now);
    expect(publicRoom.mood).toBe('friendly');
    expect(publicRoom.theme).toBe('space');
    expect(toPublicRoom(room({ mood: 'playful', theme: 'retro' }), now)).toEqual(
      expect.objectContaining({ mood: 'playful', theme: 'retro' }),
    );
  });

  it('shows Harvest Table through November and the default theme once it ends', () => {
    const harvest = room({ theme: 'harvest' });
    expect(toPublicRoom(harvest, Date.parse('2026-11-30T23:59:59Z')).theme).toBe('harvest');
    expect(toPublicRoom(harvest, Date.parse('2026-12-01T00:00:00Z')).theme).toBe('default');
  });

  it('reads unrecognised stored values as the defaults', () => {
    const publicRoom = toPublicRoom(room({ mood: 'feral', theme: 'neon' }), now);
    expect(publicRoom.mood).toBe('playful');
    expect(publicRoom.theme).toBe('default');
  });
});
