import { DEFAULT_SITE_CONFIG, SiteConfigSchema } from '../../src/site/config';

describe('site config', () => {
  it('fills every default from an empty file', () => {
    expect(SiteConfigSchema.parse({})).toEqual(DEFAULT_SITE_CONFIG);
    expect(DEFAULT_SITE_CONFIG.content.moods).toEqual(['friendly', 'playful', 'spicy']);
    expect(DEFAULT_SITE_CONFIG.limits.daily.roomsCreated).toEqual({
      perVisitor: 5,
      perNetwork: 20,
      perSite: 100,
    });
    expect(DEFAULT_SITE_CONFIG.access.passwordProtects).toBe('nothing');
    expect(DEFAULT_SITE_CONFIG.features).toEqual({
      feedback: true,
      issues: true,
      usageStats: true,
    });
    expect(DEFAULT_SITE_CONFIG.limits).toMatchObject({
      maxUsersPerRoom: 25,
      maxRooms: 1000,
      inactiveRoomDays: 90,
      usageRetentionDays: 400,
    });
  });

  it('keeps defaults for keys a partial section leaves out', () => {
    const config = SiteConfigSchema.parse({
      limits: { daily: { roomsCreated: { perVisitor: 2 } } },
    });
    expect(config.limits.daily.roomsCreated).toEqual({
      perVisitor: 2,
      perNetwork: 20,
      perSite: 100,
    });
    expect(config.limits.maxRooms).toBe(1000);
  });

  it.each([
    [{ unknown: true }, 'Unrecognized key'],
    [{ content: { moods: ['friendly'] } }, 'defaultMood must be one of moods'],
    [{ content: { themes: ['space'] } }, 'defaultTheme must be one of themes'],
    [
      { content: { moods: ['friendly', 'friendly'], defaultMood: 'friendly' } },
      'List each mood once',
    ],
    [{ content: { themes: ['space', 'space'], defaultTheme: 'space' } }, 'List each theme once'],
    [{ content: { blockedThrowables: ['not-a-throwable'] } }, 'Not a known throwable'],
    [{ content: { blockedThrowables: ['💩', '💩'] } }, 'List each throwable once'],
    [{ legal: { termsFile: '../secrets.md' } }, 'Use a file name in the config folder'],
    [{ limits: { maxUsersPerRoom: 1 } }, 'Too small'],
  ])('rejects %j', (input, message) => {
    const result = SiteConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain(message);
  });

  it('accepts legal files in the config folder', () => {
    const config = SiteConfigSchema.parse({
      legal: { termsFile: 'terms.md', privacyFile: 'privacy.txt' },
    });
    expect(config.legal.termsFile).toBe('terms.md');
  });
});
