import { VersionSchema } from '@poker/shared';
import { resolveApiUrl } from '../api/api-url';
import { DestroyRef, Injectable, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class VersionCheckService {
  private readonly destroyRef = inject(DestroyRef);

  updateAvailable = signal(false);

  private currentVersion: string | null = null;

  constructor() {
    // Check for updates every 5 minutes
    interval(5 * 60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.checkForUpdate();
      });

    // Also check on init
    this.checkForUpdate();
  }

  async checkForUpdate(): Promise<void> {
    if (isDevMode()) {
      return;
    }

    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });

      // The development server serves index.html for unknown asset paths. Treat that
      // response (and a genuinely missing version file) as "update checks disabled"
      // instead of attempting to parse HTML as JSON.
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        return;
      }

      const parsed = VersionSchema.safeParse(await response.json());
      if (!parsed.success) return;
      const newVersion = parsed.data.version;

      if (!this.currentVersion) {
        this.currentVersion = newVersion;
        return;
      }

      if (newVersion && this.currentVersion !== newVersion) {
        this.updateAvailable.set(true);
      }
    } catch (err) {
      // Version file might not exist in dev
      console.warn('Could not check for updates', err);
    }
  }

  /** The API build version, or a status label when it cannot be read. */
  async getApiVersion(): Promise<string> {
    try {
      const response = await fetch(`${resolveApiUrl()}/api/version`);
      if (!response.ok) return 'Unknown';
      const parsed = VersionSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.version : 'Unknown';
    } catch {
      return 'Disconnected';
    }
  }

  /** This web build's version, or a status label in development or when it cannot be read. */
  async getWebVersion(): Promise<string> {
    if (isDevMode()) {
      return 'Development';
    }

    try {
      const response = await fetch('/version.json');
      if (!response.ok) return 'Unknown';
      const parsed = VersionSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.version : 'Unknown';
    } catch {
      return 'Development';
    }
  }
}
