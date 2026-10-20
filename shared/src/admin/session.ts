import { z } from 'zod';

/** POST /api/admin/session: the admin password an operator typed. */
export const AdminSignInRequestSchema = z.strictObject({
  password: z.string().min(1).max(256),
});
export type AdminSignInRequest = z.infer<typeof AdminSignInRequestSchema>;

/** GET and POST /api/admin/session: whether this browser is signed in to the admin page. */
export const AdminSessionStatusSchema = z.discriminatedUnion('signedIn', [
  z.strictObject({ signedIn: z.literal(false) }),
  z.strictObject({
    signedIn: z.literal(true),
    environment: z.enum(['development', 'production']),
  }),
]);
export type AdminSessionStatus = z.infer<typeof AdminSessionStatusSchema>;
