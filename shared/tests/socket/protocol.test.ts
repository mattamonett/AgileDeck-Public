import {
  ErrorResponseSchema,
  HealthStatusSchema,
  ReplayEnvelopeSchema,
  VersionSchema,
} from '../../src/socket/protocol';

describe('socket protocol contracts', () => {
  it('rejects malformed server payloads before consumers access fields', () => {
    expect(
      HealthStatusSchema.parse({
        api: 'healthy',
        db: 'unhealthy',
        timestamp: '2026-09-21T00:00:00.000Z',
      }).db,
    ).toBe('unhealthy');
    expect(
      HealthStatusSchema.safeParse({
        api: 'unknown',
        db: 'healthy',
        timestamp: 'yesterday',
      }).success,
    ).toBe(false);
    expect(VersionSchema.safeParse({ version: {} }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ message: {} }).success).toBe(false);
  });

  it('accepts only a bounded positive integral replay sequence', () => {
    for (const clientSeq of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
      expect(
        ReplayEnvelopeSchema.safeParse({
          _meta: { connectionNonce: 'nonce', clientSeq },
        }).success,
      ).toBe(false);
    expect(
      ReplayEnvelopeSchema.parse({
        _meta: { connectionNonce: 'nonce', clientSeq: 1 },
      })._meta.clientSeq,
    ).toBe(1);
  });
});
