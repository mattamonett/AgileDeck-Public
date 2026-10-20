import { THEMES, UpdateThemeSchema } from '../src/themes';

describe('themes', () => {
  it('defines selectable themes', () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(THEMES.length);
    expect(ids).toEqual(['default', 'space', 'retro', 'vegas', 'graveyard']);
    expect(THEMES.every((theme) => theme.name.length > 0 && theme.icon.length > 0)).toBe(true);
  });
});

describe('UpdateThemeSchema', () => {
  it('should validate valid data', () => {
    expect(UpdateThemeSchema.parse({ theme: 'space' })).toEqual({
      theme: 'space',
    });
  });

  it.each(['default', 'space', 'retro', 'vegas', 'graveyard'])(
    'accepts supported theme %s',
    (theme) => {
      expect(UpdateThemeSchema.parse({ theme }).theme).toBe(theme);
    },
  );
  it.each(['', 'unknown', 'SPACE', null])('rejects unsupported theme %j', (theme) => {
    expect(UpdateThemeSchema.safeParse({ theme }).success).toBe(false);
  });
});
