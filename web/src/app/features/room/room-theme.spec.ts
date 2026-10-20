import { isGardenTheme } from './room-theme';

describe('isGardenTheme', () => {
  it('treats the default and missing themes as the garden', () => {
    expect(isGardenTheme('default')).toBe(true);
    expect(isGardenTheme('')).toBe(true);
    expect(isGardenTheme(null)).toBe(true);
    expect(isGardenTheme(undefined)).toBe(true);
  });

  it('does not treat named themes as the garden', () => {
    expect(isGardenTheme('vegas')).toBe(false);
    expect(isGardenTheme('space')).toBe(false);
  });
});
