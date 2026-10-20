import { z } from 'zod';

/** POST /api/access: the site password a visitor typed. */
export const SiteAccessRequestSchema = z.strictObject({
  password: z.string().min(1).max(256),
});
export type SiteAccessRequest = z.infer<typeof SiteAccessRequestSchema>;

/** GET and POST /api/access: whether this browser may use what the password protects. */
export const SiteAccessStatusSchema = z.strictObject({ unlocked: z.boolean() });
export type SiteAccessStatus = z.infer<typeof SiteAccessStatusSchema>;
