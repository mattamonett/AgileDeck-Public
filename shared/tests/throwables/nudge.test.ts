import { NudgeEventSchema, NudgeSchema } from '../../src/throwables/nudge';

describe('NudgeSchema', () => {
  it('should validate valid data', () => {
    expect(NudgeSchema.parse({ targetUserId: 'u2' })).toEqual({
      targetUserId: 'u2',
    });
  });

  it('rejects a blank target', () => {
    expect(NudgeSchema.safeParse({ targetUserId: '' }).success).toBe(false);
  });
});

describe('NudgeEventSchema', () => {
  it('accepts nudges only at the three escalation levels', () => {
    const nudge = { targetUserId: 'slow', sourceUserId: 'pat', level: 2 };
    expect(NudgeEventSchema.parse(nudge)).toEqual(nudge);
    for (const level of [0, 4, 1.5, '3'])
      expect(NudgeEventSchema.safeParse({ ...nudge, level }).success).toBe(false);
    expect(NudgeEventSchema.safeParse({ targetUserId: 'slow', level: 1 }).success).toBe(false);
  });
});
