import {
  halloweenAvailability,
  thanksgivingAvailability,
  christmasAvailability,
  isAvailableInteraction,
} from '../../../src/modules/interactions/seasonal-throwables.service';
import { setSiteConfig } from '../../../src/config/site-config';

describe('server seasonal availability', () => {
  const september = new Date('2026-09-25T12:00:00Z');

  it('keeps Halloween closed outside October', () => {
    expect(halloweenAvailability(september)).toEqual({
      halloweenAvailable: false,
    });
    expect(isAvailableInteraction('🎃', 'playful', september)).toBe(false);
  });

  it('enables October and closes at November', () => {
    expect(halloweenAvailability(new Date('2026-10-31T23:59:59.999Z'))).toEqual({
      halloweenAvailable: true,
    });
    expect(isAvailableInteraction('🧛', 'playful', new Date('2026-11-01T00:00:00Z'))).toBe(false);
    expect(isAvailableInteraction('📄', 'playful', september)).toBe(true);
  });
});

describe('Thanksgiving availability', () => {
  it('keeps Thanksgiving closed outside November', () => {
    const date = new Date('2026-09-26');
    expect(thanksgivingAvailability(date)).toEqual({
      thanksgivingAvailable: false,
    });
    expect(isAvailableInteraction('🦃', 'playful', date)).toBe(false);
  });
  it('uses November on the server clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20'));
    try {
      expect(thanksgivingAvailability()).toEqual({
        thanksgivingAvailable: true,
      });
    } finally {
      jest.useRealTimers();
    }
    expect(isAvailableInteraction('🦃', 'playful', new Date('2026-12-01'))).toBe(false);
  });
});

describe('Christmas availability', () => {
  it('keeps Christmas closed outside December', () => {
    const date = new Date('2026-09-26');
    expect(christmasAvailability(date)).toEqual({ christmasAvailable: false });
    expect(isAvailableInteraction('🎅', 'playful', date)).toBe(false);
  });
  it('uses December on the server clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-20'));
    try {
      expect(christmasAvailability()).toEqual({ christmasAvailable: true });
    } finally {
      jest.useRealTimers();
    }
    expect(isAvailableInteraction('🎅', 'playful', new Date('2027-01-01'))).toBe(false);
  });
});

describe("operator's throwable settings", () => {
  const october = new Date('2026-10-15T12:00:00Z');
  const november = new Date('2026-11-15T12:00:00Z');
  const december = new Date('2026-12-15T12:00:00Z');
  afterEach(() => setSiteConfig());

  it('never opens a season when seasonal throwables are off', () => {
    setSiteConfig({ content: { seasonalThrowables: false } });
    expect(halloweenAvailability(october)).toEqual({
      halloweenAvailable: false,
    });
    expect(thanksgivingAvailability(november)).toEqual({
      thanksgivingAvailable: false,
    });
    expect(christmasAvailability(december)).toEqual({
      christmasAvailable: false,
    });
    expect(isAvailableInteraction('🎃', 'playful', october)).toBe(false);
    expect(isAvailableInteraction('🍅', 'playful', october)).toBe(true);
  });

  it('closes every season and throwable when throwing is off', () => {
    setSiteConfig({ content: { throwables: false } });
    expect(halloweenAvailability(october)).toEqual({
      halloweenAvailable: false,
    });
    expect(isAvailableInteraction('🍅', 'playful', october)).toBe(false);
  });

  it('refuses blocked throwables and rough ones in Friendly rooms', () => {
    setSiteConfig({ content: { blockedThrowables: ['🍅'] } });
    expect(isAvailableInteraction('🍅', 'spicy', october)).toBe(false);
    expect(isAvailableInteraction('💩', 'friendly', october)).toBe(false);
    expect(isAvailableInteraction('💩', 'spicy', october)).toBe(true);
  });
});
