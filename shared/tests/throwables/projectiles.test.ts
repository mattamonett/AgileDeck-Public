import { ProjectileSchema } from '../../src/throwables/projectiles';

describe('ProjectileSchema', () => {
  it('should validate valid data', () => {
    expect(ProjectileSchema.parse({ targetUserId: 'u2', emoji: '🍅' })).toEqual({
      targetUserId: 'u2',
      emoji: '🍅',
    });
  });

  it('should validate without optional emoji', () => {
    expect(ProjectileSchema.parse({ targetUserId: 'u2' })).toEqual({
      targetUserId: 'u2',
    });
  });

  it.each(['🎰', '💎', '🍒', '💰', '🎲'])('should validate the Vegas projectile %s', (emoji) => {
    expect(ProjectileSchema.parse({ targetUserId: 'u2', emoji })).toEqual({
      targetUserId: 'u2',
      emoji,
    });
  });

  it('should fail on invalid emoji', () => {
    expect(() => ProjectileSchema.parse({ targetUserId: 'u2', emoji: 'invalid' })).toThrow();
  });
});

describe('interaction emoji rules', () => {
  it('accept valid throwables and an empty default', () => {
    for (const emoji of ['🍅', '🇺🇸', '']) {
      expect(ProjectileSchema.safeParse({ targetUserId: 'u2', emoji }).success).toBe(true);
    }
    for (const emoji of ['<b>', 'invalid!']) {
      expect(ProjectileSchema.safeParse({ targetUserId: 'u2', emoji }).success).toBe(false);
    }
  });

  it('report invalid emoji with a clear message', () => {
    const result = ProjectileSchema.safeParse({ targetUserId: 'u2', emoji: '<b>' });
    expect(result.error?.issues[0]?.message).toBe('Invalid emoji character');
  });
});
