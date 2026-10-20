import { z } from 'zod';
import { RoomMoodSchema } from '../room/mood';
import { isSeasonalTheme } from '../seasons/seasonal-themes';
import { Theme } from '../themes';
import { RETIRED_THROWABLES, VALID_INTERACTION_CHARACTERS } from '../throwables/catalog';

/**
 * Settings a site operator controls from config/site.json. Every key is
 * optional; anything left out keeps the default shown here. The API reads the
 * file once at startup and enforces it; the browser receives the public part
 * from GET /api/site-config. See docs/self-hosting.md.
 */

const ALL_MOODS = RoomMoodSchema.options;
const ALL_THEMES = Object.values(Theme);
const ThemeIdSchema = z.enum(Theme);

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

const count = (max: number) => z.number().int().min(1).max(max);

/** A visitor, network and site-wide budget for one action per UTC day. */
const dailyLimit = (visitor: number, network: number, site: number) =>
  z
    .strictObject({
      perVisitor: count(1_000_000).default(visitor),
      perNetwork: count(1_000_000).default(network),
      perSite: count(10_000_000).default(site),
    })
    .prefault({});

const LegalFileSchema = z
  .string()
  .regex(/^[\w-][\w.-]*\.(md|txt)$/, 'Use a file name in the config folder, ending in .md or .txt')
  .nullable();

export const SiteConfigSchema = z
  .strictObject({
    site: z
      .strictObject({
        name: z.string().trim().min(1).max(60).default('Agile Deck'),
        contactEmail: z.email().max(254).default('admin@example.com'),
        governingLaw: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .default('the state or country where the site owner lives'),
        networkProviders: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
      })
      .prefault({}),
    content: z
      .strictObject({
        moods: z
          .array(RoomMoodSchema)
          .min(1)
          .refine(unique, 'List each mood once')
          .default([...ALL_MOODS]),
        defaultMood: RoomMoodSchema.default('playful'),
        throwables: z.boolean().default(true),
        blockedThrowables: z
          .array(
            z
              .string()
              .refine(
                (value) => VALID_INTERACTION_CHARACTERS.has(value) || RETIRED_THROWABLES.has(value),
                { message: 'Not a known throwable' },
              ),
          )
          .refine(unique, 'List each throwable once')
          .transform((chars) => chars.filter((char) => !RETIRED_THROWABLES.has(char)))
          .default([]),
        seasonalThrowables: z.boolean().default(true),
        themes: z
          .array(ThemeIdSchema)
          .min(1)
          .refine(unique, 'List each theme once')
          .default([...ALL_THEMES]),
        defaultTheme: ThemeIdSchema.default(Theme.GARDEN),
      })
      .prefault({})
      .refine((content) => content.moods.includes(content.defaultMood), {
        message: 'defaultMood must be one of moods',
        path: ['defaultMood'],
      })
      .refine((content) => content.themes.includes(content.defaultTheme), {
        message: 'defaultTheme must be one of themes',
        path: ['defaultTheme'],
      })
      .refine((content) => !isSeasonalTheme(content.defaultTheme), {
        message: 'defaultTheme cannot be a seasonal theme',
        path: ['defaultTheme'],
      }),
    features: z
      .strictObject({
        feedback: z.boolean().default(true),
        issues: z.boolean().default(true),
        usageStats: z.boolean().default(true),
      })
      .prefault({}),
    legal: z
      .strictObject({
        requireAgreement: z.boolean().default(true),
        termsFile: LegalFileSchema.default(null),
        privacyFile: LegalFileSchema.default(null),
        updated: z.string().trim().min(1).max(40).nullable().default(null),
      })
      .prefault({}),
    limits: z
      .strictObject({
        maxUsersPerRoom: z.number().int().min(2).max(100).default(25),
        maxRooms: count(100_000).default(1000),
        inactiveRoomDays: count(3650).default(90),
        usageRetentionDays: count(3650).default(400),
        daily: z
          .strictObject({
            roomsCreated: dailyLimit(5, 20, 100),
            newVisitors: z
              .strictObject({
                perNetwork: count(1_000_000).default(100),
                perSite: count(10_000_000).default(1000),
              })
              .prefault({}),
            joinRequests: z
              .strictObject({
                perVisitor: count(1_000_000).default(3),
                perNetwork: count(1_000_000).default(30),
              })
              .prefault({}),
            issueImports: dailyLimit(20, 40, 500),
            feedbackPosts: dailyLimit(5, 20, 1000),
            feedbackVotes: dailyLimit(100, 300, 10_000),
            feedbackReplies: dailyLimit(20, 50, 500),
          })
          .prefault({}),
      })
      .prefault({}),
    access: z
      .strictObject({
        /** What the SITE_PASSWORD environment variable protects. */
        passwordProtects: z.enum(['nothing', 'room-creation', 'everything']).default('nothing'),
      })
      .prefault({}),
  })
  .prefault({});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SiteConfigInput = z.input<typeof SiteConfigSchema>;
export type PasswordProtection = SiteConfig['access']['passwordProtects'];

export const DEFAULT_SITE_CONFIG: SiteConfig = SiteConfigSchema.parse(undefined);
