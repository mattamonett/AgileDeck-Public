import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SITE_CONFIG,
  SiteConfigSchema,
  toPublicSiteConfig,
  type PublicSiteConfig,
  type SiteConfig,
  type SiteConfigInput,
} from '@poker/shared';
import { buildLegalText } from './legal-text';
import { SiteConfigError } from './site-config-error';

export { SiteConfigError } from './site-config-error';

const SITE_CONFIG_FILE_NAME = 'site.json';

/** config/ next to api/, which is the working directory in Docker and in development. */
export function siteConfigDirectory(): string {
  return process.env.SITE_CONFIG_DIR ?? path.resolve(process.cwd(), '..', 'config');
}

/** The agreement visitors accept: compare its version, store its text. */
export interface SiteAgreement {
  readonly version: string;
  readonly text: string;
}

interface LoadedSiteConfig {
  readonly config: SiteConfig;
  readonly publicConfig: PublicSiteConfig;
  readonly agreement: SiteAgreement;
}

function prepare(config: SiteConfig, directory: string | null): LoadedSiteConfig {
  const legal = buildLegalText(config, directory);
  return {
    config,
    publicConfig: toPublicSiteConfig(config, legal),
    agreement: { version: legal.agreementVersion, text: legal.agreementText },
  };
}

let current: LoadedSiteConfig = prepare(DEFAULT_SITE_CONFIG, null);

export function getSiteConfig(): SiteConfig {
  return current.config;
}

export function getPublicSiteConfig(): PublicSiteConfig {
  return current.publicConfig;
}

export function getSiteAgreement(): SiteAgreement {
  return current.agreement;
}

/** SITE_PASSWORD comes only from the environment, never from site.json. */
const SITE_PASSWORD_MIN_LENGTH = 8;

function assertSitePasswordConfigured(config: SiteConfig): void {
  if (config.access.passwordProtects === 'nothing') return;
  const password = process.env.SITE_PASSWORD ?? '';
  if (password.length < SITE_PASSWORD_MIN_LENGTH)
    throw new SiteConfigError(
      `access.passwordProtects is "${config.access.passwordProtects}", so set the SITE_PASSWORD environment variable to at least ${SITE_PASSWORD_MIN_LENGTH} characters`,
    );
}

function describeIssues(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => `  ${issue.path.map(String).join('.') || '(top level)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Reads config/site.json once at startup. A missing file means every default;
 * a file that is not valid JSON or breaks the schema, a legal file that cannot
 * be used, or a missing SITE_PASSWORD stops the API, so a typo never silently
 * falls back to settings the operator meant to change.
 */
export function loadSiteConfig(directory = siteConfigDirectory()): SiteConfig {
  const file = path.join(directory, SITE_CONFIG_FILE_NAME);
  if (!fs.existsSync(file)) return apply(DEFAULT_SITE_CONFIG, directory);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SiteConfigError(`${file} is not valid JSON: ${String(error)}`);
  }
  const parsed = SiteConfigSchema.safeParse(raw);
  if (!parsed.success)
    throw new SiteConfigError(`${file} has invalid settings:\n${describeIssues(parsed.error)}`);
  return apply(parsed.data, directory);
}

function apply(config: SiteConfig, directory: string): SiteConfig {
  assertSitePasswordConfigured(config);
  current = prepare(config, directory);
  return current.config;
}

/** Tests replace the settings in-process instead of writing a file. */
export function setSiteConfig(
  input: SiteConfigInput = {},
  directory: string | null = null,
): SiteConfig {
  current = prepare(SiteConfigSchema.parse(input), directory);
  return current.config;
}
