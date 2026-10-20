import { z } from 'zod';
import type { LegalSection } from '../legal/sections';
import { RoomMoodSchema } from '../room/mood';
import { Theme } from '../themes';
import type { SiteConfig } from './config';

const ThemeIdSchema = z.enum(Theme);

const LegalSectionSchema = z.strictObject({
  heading: z.string(),
  paragraphs: z.array(z.string()),
});

/** What the browser needs to know; nothing in it is secret. */
export const PublicSiteConfigSchema = z.strictObject({
  site: z.strictObject({ name: z.string(), contactEmail: z.string() }),
  content: z.strictObject({
    moods: z.array(RoomMoodSchema),
    defaultMood: RoomMoodSchema,
    throwables: z.boolean(),
    blockedThrowables: z.array(z.string()),
    seasonalThrowables: z.boolean(),
    themes: z.array(ThemeIdSchema),
    defaultTheme: ThemeIdSchema,
  }),
  features: z.strictObject({
    feedback: z.boolean(),
    issues: z.boolean(),
    usageStats: z.boolean(),
  }),
  limits: z.strictObject({ maxUsersPerRoom: z.number().int() }),
  legal: z.strictObject({
    requireAgreement: z.boolean(),
    agreementVersion: z.string(),
    termsUpdated: z.string(),
    terms: z.array(LegalSectionSchema),
    privacyUpdated: z.string(),
    privacy: z.array(LegalSectionSchema),
  }),
  access: z.strictObject({
    passwordProtects: z.enum(['nothing', 'room-creation', 'everything']),
  }),
});
export type PublicSiteConfig = z.infer<typeof PublicSiteConfigSchema>;

export interface PublicLegalText {
  readonly agreementVersion: string;
  readonly termsUpdated: string;
  readonly terms: readonly LegalSection[];
  readonly privacyUpdated: string;
  readonly privacy: readonly LegalSection[];
}

export function toPublicSiteConfig(
  config: SiteConfig,
  legalText: PublicLegalText,
): PublicSiteConfig {
  return {
    site: { name: config.site.name, contactEmail: config.site.contactEmail },
    content: {
      ...config.content,
      moods: [...config.content.moods],
      blockedThrowables: [...config.content.blockedThrowables],
      themes: [...config.content.themes],
    },
    features: { ...config.features },
    limits: { maxUsersPerRoom: config.limits.maxUsersPerRoom },
    legal: {
      requireAgreement: config.legal.requireAgreement,
      agreementVersion: legalText.agreementVersion,
      termsUpdated: legalText.termsUpdated,
      terms: legalText.terms.map(copySection),
      privacyUpdated: legalText.privacyUpdated,
      privacy: legalText.privacy.map(copySection),
    },
    access: { ...config.access },
  };
}

function copySection(section: LegalSection) {
  return { heading: section.heading, paragraphs: [...section.paragraphs] };
}
