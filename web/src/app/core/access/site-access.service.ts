import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiPath, SiteAccessStatusSchema } from '@poker/shared';
import { resolveApiUrl } from '../api/api-url';
import { SiteConfigService } from '../config/site-config.service';
import { apiErrorMessage } from '../api/api-request';
import { requestVisitorSession } from '../session/visitor-session';

export type UnlockResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Whether this browser entered the site password. The server keeps the
 * password and sets an HttpOnly cookie; this only mirrors its answer.
 */
@Injectable({ providedIn: 'root' })
export class SiteAccessService {
  private readonly siteConfig = inject(SiteConfigService);
  private readonly unlockedState = signal(false);
  readonly protects = computed(() => this.siteConfig.config().access.passwordProtects);
  /** True when no password applies or this browser entered it. */
  readonly unlocked = computed(() => this.protects() === 'nothing' || this.unlockedState());
  readonly siteLocked = computed(() => this.protects() === 'everything' && !this.unlocked());

  /** Asks the server; called once the settings are loaded. */
  async refresh(): Promise<void> {
    if (this.protects() === 'nothing') return;
    try {
      const response = await fetch(resolveApiUrl() + ApiPath.ACCESS, {
        cache: 'no-store',
        credentials: 'include',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return;
      const parsed = SiteAccessStatusSchema.safeParse(await response.json());
      if (parsed.success) this.unlockedState.set(parsed.data.unlocked);
    } catch {
      // Stay locked; the server refuses protected requests either way.
    }
  }

  async unlock(password: string): Promise<UnlockResult> {
    const apiUrl = resolveApiUrl();
    try {
      // The access cookie is bound to the browser ID, so make sure there is one.
      await requestVisitorSession(apiUrl);
      const response = await fetch(apiUrl + ApiPath.ACCESS, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body: unknown = await response.json().catch(() => null);
      const status = SiteAccessStatusSchema.safeParse(body);
      if (response.ok && status.success && status.data.unlocked) {
        this.unlockedState.set(true);
        return { ok: true };
      }
      return {
        ok: false,
        message: apiErrorMessage(body) ?? 'That did not work. Please try again.',
      };
    } catch {
      return { ok: false, message: 'Could not reach the site. Please try again.' };
    }
  }
}
