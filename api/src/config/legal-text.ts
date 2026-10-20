import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LEGAL_UPDATED,
  DEFAULT_SITE_CONFIG,
  defaultPrivacyNotice,
  defaultSiteAgreement,
  LEGAL_FILE_MAX_BYTES,
  legalSectionsText,
  parseLegalText,
  type LegalSection,
  type PublicLegalText,
  type SiteConfig,
} from '@poker/shared';
import { SiteConfigError } from './site-config-error';

export interface LegalText extends PublicLegalText {
  /** The exact agreement text visitors see, stored with each acceptance. */
  readonly agreementText: string;
}

/** Changes whenever the agreement text does, so visitors accept again. */
export function agreementVersionOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function message(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  if ('code' in error && error.code === 'ENOENT') return 'the file does not exist';
  return 'message' in error && typeof error.message === 'string' ? error.message : String(error);
}

function readLegalFile(
  setting: 'termsFile' | 'privacyFile',
  name: string,
  config: SiteConfig,
  directory: string | null,
): LegalSection[] {
  if (directory === null)
    throw new SiteConfigError(`legal.${setting} needs a config folder to read ${name} from`);
  const file = path.join(directory, name);
  let text: string;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('it is not a file');
    if (stat.size > LEGAL_FILE_MAX_BYTES)
      throw new Error(`it is larger than ${LEGAL_FILE_MAX_BYTES / 1024} KB`);
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new SiteConfigError(`legal.${setting}: cannot use ${file}: ${message(error)}`);
  }
  try {
    return parseLegalText(text, config);
  } catch (error) {
    throw new SiteConfigError(`legal.${setting}: ${file}: ${message(error)}`);
  }
}

/**
 * The site agreement and privacy notice the browser shows for these settings:
 * the operator's own files when configured, otherwise the built-in text.
 * A configured file that is missing, unreadable, too large or empty throws.
 */
export function buildLegalText(config: SiteConfig, directory: string | null): LegalText {
  const { termsFile, privacyFile, updated } = config.legal;
  const terms = termsFile
    ? readLegalFile('termsFile', termsFile, config, directory)
    : defaultSiteAgreement(config);
  const privacy = privacyFile
    ? readLegalFile('privacyFile', privacyFile, config, directory)
    : defaultPrivacyNotice(config);
  const agreementText = legalSectionsText(terms);
  return {
    agreementVersion: agreementVersionOf(agreementText),
    agreementText,
    termsUpdated: updated ?? DEFAULT_LEGAL_UPDATED,
    terms,
    privacyUpdated: updated ?? DEFAULT_LEGAL_UPDATED,
    privacy,
  };
}

/**
 * Settings the operator still needs to fill in before the legal text names
 * them correctly. The defaults are placeholders, never a real owner.
 */
export function legalSetupWarnings(config: SiteConfig): string[] {
  const defaults = DEFAULT_SITE_CONFIG.site;
  const warnings: string[] = [];
  if (config.site.contactEmail === defaults.contactEmail)
    warnings.push(
      `site.contactEmail is still ${defaults.contactEmail}; set your own address in config/site.json`,
    );
  if (config.legal.termsFile === null && config.site.governingLaw === defaults.governingLaw)
    warnings.push(
      'site.governingLaw is still the placeholder; set your jurisdiction in config/site.json',
    );
  return warnings;
}
