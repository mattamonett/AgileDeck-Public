import { getSiteAgreement, getSiteConfig, type SiteAgreement } from '../../config/site-config';

interface AgreementAcceptance {
  readonly version?: string | undefined;
  readonly accepted?: boolean | undefined;
}

/** Sites that ask for no agreement ignore any acceptance the browser sends. */
export function acceptsCurrentAgreement(acceptance: AgreementAcceptance | undefined): boolean {
  if (!getSiteConfig().legal.requireAgreement) return true;
  return acceptance?.version === getSiteAgreement().version && acceptance.accepted === true;
}

/** The agreement to record with an accepted action, or null when none is asked for. */
export function requiredAgreement(): SiteAgreement | null {
  return getSiteConfig().legal.requireAgreement ? getSiteAgreement() : null;
}

/** The columns that record which agreement a visitor accepted, and when. */
export function agreementRecord(agreement: SiteAgreement) {
  return {
    agreementVersion: agreement.version,
    agreementText: agreement.text,
    agreementAcceptedAt: new Date(),
  };
}
