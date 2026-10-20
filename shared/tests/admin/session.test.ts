import { AdminSessionStatusSchema, AdminSignInRequestSchema } from '../../src/admin/session';

describe('admin session contract', () => {
  it('accepts a bounded password and nothing else', () => {
    expect(AdminSignInRequestSchema.safeParse({ password: 'secret' }).success).toBe(true);
    expect(AdminSignInRequestSchema.safeParse({ password: '' }).success).toBe(false);
    expect(AdminSignInRequestSchema.safeParse({ password: 'x'.repeat(257) }).success).toBe(false);
    expect(AdminSignInRequestSchema.safeParse({ password: 'secret', token: 'x' }).success).toBe(
      false,
    );
  });

  it('reports the environment only when signed in', () => {
    expect(AdminSessionStatusSchema.parse({ signedIn: false })).toEqual({ signedIn: false });
    expect(AdminSessionStatusSchema.parse({ signedIn: true, environment: 'production' })).toEqual({
      signedIn: true,
      environment: 'production',
    });
    expect(
      AdminSessionStatusSchema.safeParse({ signedIn: false, environment: 'production' }).success,
    ).toBe(false);
    expect(AdminSessionStatusSchema.safeParse({ signedIn: true }).success).toBe(false);
  });
});
