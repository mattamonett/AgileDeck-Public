import { ApplicationRef, DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { interval } from 'rxjs';
import { concatMap, filter, first } from 'rxjs/operators';
import { AUTO_RELOAD_STORAGE_KEY } from '../storage/storage-keys';
import { VersionCheckService } from './version-check.service';

/** Remembers the last automatic reload so a build that never settles cannot reload forever. */
const AUTO_RELOAD_COOLDOWN_MS = 60_000;

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  // Optional so stores and components that use this service can be tested without a service worker.
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly versionCheck = inject(VersionCheckService);

  private updateReady = false;
  private pendingCheck: Promise<boolean> | null = null;

  constructor() {
    if (this.swUpdate?.isEnabled) {
      // The service worker serves the cached build first, so a visit right after a deploy
      // starts on the old code. Switch to the new build before the visitor gets going.
      void this.reloadIfUpdateAvailable();
      this.checkForUpdates();
      this.handleUpdates(this.swUpdate);
    }
  }

  /**
   * Reloads into the newest deployed build when one is available, so an old cached page
   * never keeps talking to a newer API. Resolves false when this page is already current.
   */
  async reloadIfUpdateAvailable(): Promise<boolean> {
    if (!(await this.isUpdateReady())) return false;
    return this.activateAndReload({ automatic: true });
  }

  /** Reloads into the newest deployed build, activating it first when the service worker has it. */
  async reloadToLatest(): Promise<void> {
    if (!(await this.isUpdateReady()) || !(await this.activateAndReload({ automatic: false }))) {
      this.reloadPage();
    }
  }

  /** Loads the page again; the service worker serves whichever build is active. */
  reloadPage(): void {
    window.location.reload();
  }

  private isUpdateReady(): Promise<boolean> {
    const swUpdate = this.swUpdate;
    if (!swUpdate?.isEnabled) return Promise.resolve(false);
    if (this.updateReady) return Promise.resolve(true);
    this.pendingCheck ??= swUpdate
      .checkForUpdate()
      .then((found) => found || this.updateReady)
      .catch(() => false)
      .finally(() => {
        this.pendingCheck = null;
      });
    return this.pendingCheck;
  }

  private async activateAndReload({ automatic }: { automatic: boolean }): Promise<boolean> {
    if (automatic && this.reloadedRecently()) return false;
    try {
      await this.swUpdate?.activateUpdate();
    } catch {
      return false;
    }
    if (automatic) this.rememberAutomaticReload();
    this.reloadPage();
    return true;
  }

  private reloadedRecently(): boolean {
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY));
      return Number.isFinite(last) && Date.now() - last < AUTO_RELOAD_COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  private rememberAutomaticReload(): void {
    try {
      sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, String(Date.now()));
    } catch {
      // Without storage the cooldown is skipped; activating the update still prevents a loop.
    }
  }

  private handleUpdates(swUpdate: SwUpdate): void {
    swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.updateReady = true;
        this.versionCheck.updateAvailable.set(true);
      });

    // The cached build lost files it needs (for example after the browser evicted part of
    // the cache), so it cannot keep running. Only a fresh load from the server recovers.
    swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.reloadedRecently()) return;
      this.rememberAutomaticReload();
      this.reloadPage();
    });
  }

  private checkForUpdates(): void {
    // Check for updates every 6 hours
    const hours = 6;
    const milliseconds = hours * 60 * 60 * 1000;

    // Poll for updates when the app is stable
    this.appRef.isStable
      .pipe(
        filter((isStable: boolean) => isStable === true),
        first(),
        concatMap(() => interval(milliseconds)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        void this.swUpdate?.checkForUpdate();
      });
  }
}
