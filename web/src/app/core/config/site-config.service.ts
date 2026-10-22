import { computed, Injectable, signal } from '@angular/core';
import {
  ApiPath,
  DEFAULT_LEGAL_UPDATED,
  DEFAULT_SITE_CONFIG,
  defaultPrivacyNotice,
  defaultSiteAgreement,
  PublicSiteConfigSchema,
  toPublicSiteConfig,
  type PublicSiteConfig,
} from '@poker/shared';
import { SITE_AGREEMENT_STORAGE_KEY } from '../storage/storage-keys';
import { resolveApiUrl } from '../api/api-url';

/**
 * Used until the server's settings arrive, and if they cannot be loaded. The
 * server derives the real agreement version, so no stored acceptance matches
 * this placeholder and the server refuses joins until the settings load.
 */
export const FALLBACK_SITE_CONFIG: PublicSiteConfig = toPublicSiteConfig(DEFAULT_SITE_CONFIG, {
  agreementVersion: 'unavailable',
  termsUpdated: DEFAULT_LEGAL_UPDATED,
  terms: defaultSiteAgreement(DEFAULT_SITE_CONFIG),
  privacyUpdated: DEFAULT_LEGAL_UPDATED,
  privacy: defaultPrivacyNotice(DEFAULT_SITE_CONFIG),
});

/** The operator's settings from config/site.json, loaded once before the app renders. */
@Injectable({ providedIn: 'root' })
export class SiteConfigService {
  private readonly current = signal<PublicSiteConfig>(FALLBACK_SITE_CONFIG);
  readonly config = this.current.asReadonly();
  readonly siteName = computed(() => this.current().site.name);
  readonly agreementRequired = computed(() => this.current().legal.requireAgreement);

  async load(): Promise<void> {
    try {
      const response = await fetch(resolveApiUrl() + ApiPath.SITE_CONFIG, {
        cache: 'no-store',
        credentials: 'include',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return;
      const parsed = PublicSiteConfigSchema.safeParse(await response.json());
      if (parsed.success) this.current.set(parsed.data);
    } catch {
      // The server enforces its settings either way; the fallback only shapes the UI.
    }
  }

  /** Tests set settings directly. */
  set(config: PublicSiteConfig): void {
    this.current.set(config);
  }

  /** True when the site asks for no agreement or this browser accepted the current one. */
  hasAcceptedAgreement(): boolean {
    return (
      !this.agreementRequired() ||
      localStorage.getItem(SITE_AGREEMENT_STORAGE_KEY) === this.current().legal.agreementVersion
    );
  }

  rememberAgreement(): void {
    if (this.agreementRequired())
      localStorage.setItem(SITE_AGREEMENT_STORAGE_KEY, this.current().legal.agreementVersion);
  }

  /** The acceptance a room join sends, or nothing when none is needed or given. */
  agreementAcceptance(): { version: string; accepted: true } | undefined {
    if (!this.agreementRequired() || !this.hasAcceptedAgreement()) return undefined;
    return { version: this.current().legal.agreementVersion, accepted: true };
  }
}
