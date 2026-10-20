import { z } from 'zod';

/**
 * The API derives the version from the agreement text it serves, so any
 * change to the text asks visitors to accept again; it compares the value.
 */
export const AgreementVersionSchema = z.string().min(1).max(64);

export const SiteAgreementAcceptanceSchema = z.strictObject({
  version: AgreementVersionSchema,
  accepted: z.literal(true),
});
export type SiteAgreementAcceptance = z.infer<typeof SiteAgreementAcceptanceSchema>;
