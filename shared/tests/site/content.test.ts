import { DEFAULT_SITE_CONFIG, SiteConfigSchema, type SiteConfigInput } from '../../src/site/config';
import {
  isMoodAllowed,
  isThemeAllowed,
  isThrowableAllowed,
  isThrowablePermitted,
  resolveRoomMood,
  resolveRoomTheme,
  type ContentSettings,
} from '../../src/site/content';
import { Theme } from '../../src/themes';

const defaults = DEFAULT_SITE_CONFIG.content;
const content = (input: NonNullable<NonNullable<SiteConfigInput>['content']>): ContentSettings =>
  SiteConfigSchema.parse({ content: input }).content;

const OCTOBER = new Date('2026-10-15T12:00:00Z');
const MARCH = new Date('2026-03-15T12:00:00Z');

describe('site content rules', () => {
  it('allows only the configured moods', () => {
    const calm = content({ moods: ['friendly', 'playful'], defaultMood: 'friendly' });
    expect(isMoodAllowed('friendly', calm)).toBe(true);
    expect(isMoodAllowed('spicy', calm)).toBe(false);
  });

  it('reads a stored mood as itself while it is allowed', () => {
    expect(resolveRoomMood('spicy', defaults)).toBe('spicy');
  });

  it('reads a mood the operator no longer allows as the default mood', () => {
    const calm = content({ moods: ['friendly', 'playful'], defaultMood: 'friendly' });
    expect(resolveRoomMood('spicy', calm)).toBe('friendly');
  });

  it.each([['grumpy'], [''], [null], [42]])('reads %j as the default mood', (value) => {
    expect(resolveRoomMood(value, defaults)).toBe('playful');
  });

  it('allows only the configured themes', () => {
    const dark = content({ themes: [Theme.SPACE, Theme.RETRO], defaultTheme: Theme.SPACE });
    expect(isThemeAllowed(Theme.RETRO, dark)).toBe(true);
    expect(isThemeAllowed(Theme.GARDEN, dark)).toBe(false);
  });

  it('reads stored themes, falling back to the default when unknown or no longer allowed', () => {
    const dark = content({ themes: [Theme.SPACE, Theme.RETRO], defaultTheme: Theme.SPACE });
    expect(resolveRoomTheme('retro', dark)).toBe(Theme.RETRO);
    expect(resolveRoomTheme('default', dark)).toBe(Theme.SPACE);
    expect(resolveRoomTheme('neon', defaults)).toBe(Theme.GARDEN);
    expect(resolveRoomTheme(undefined, defaults)).toBe(Theme.GARDEN);
  });

  it('permits every known throwable by default, subject to the room mood', () => {
    expect(isThrowablePermitted('🍅', 'playful', defaults)).toBe(true);
    expect(isThrowablePermitted('💩', 'playful', defaults)).toBe(true);
    expect(isThrowablePermitted('💩', 'friendly', defaults)).toBe(false);
    expect(isThrowablePermitted('not-a-throwable', 'playful', defaults)).toBe(false);
  });

  it('permits nothing when throwing is turned off', () => {
    const off = content({ throwables: false });
    expect(isThrowablePermitted('🍅', 'playful', off)).toBe(false);
    expect(isThrowableAllowed('🍅', 'playful', off, MARCH)).toBe(false);
  });

  it('removes blocked throwables only', () => {
    const blocked = content({ blockedThrowables: ['🍅'] });
    expect(isThrowablePermitted('🍅', 'spicy', blocked)).toBe(false);
    expect(isThrowablePermitted('🍕', 'spicy', blocked)).toBe(true);
  });

  it('keeps seasonal throwables away when the operator turns them off', () => {
    const noSeasons = content({ seasonalThrowables: false });
    expect(isThrowablePermitted('🧙', 'playful', defaults)).toBe(true);
    expect(isThrowablePermitted('🧙', 'playful', noSeasons)).toBe(false);
    expect(isThrowablePermitted('🍅', 'playful', noSeasons)).toBe(true);
  });

  it("adds the calendar on top of the operator's settings", () => {
    expect(isThrowableAllowed('🧙', 'playful', defaults, OCTOBER)).toBe(true);
    expect(isThrowableAllowed('🧙', 'playful', defaults, MARCH)).toBe(false);
    expect(
      isThrowableAllowed('🧙', 'playful', content({ seasonalThrowables: false }), OCTOBER),
    ).toBe(false);
    expect(isThrowableAllowed('🍅', 'playful', defaults)).toBe(true);
  });
});
