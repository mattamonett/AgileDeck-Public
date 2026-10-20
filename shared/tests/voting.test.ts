import { RevealStateSchema, RevelationStartedSchema, VoteSchema } from '../src/voting';

describe('VoteSchema', () => {
  it('should validate valid data', () => {
    expect(VoteSchema.parse({ vote: '5' })).toEqual({ vote: '5' });
    expect(VoteSchema.parse({ vote: null })).toEqual({ vote: null });
  });
});

describe('reveal payloads', () => {
  it('rejects malformed reveal events before consumers access fields', () => {
    expect(RevelationStartedSchema.parse({ seconds: 1.5 }).seconds).toBe(1.5);
    expect(RevelationStartedSchema.safeParse({ seconds: -1 }).success).toBe(false);
    expect(RevealStateSchema.safeParse('false').success).toBe(false);
  });
});
