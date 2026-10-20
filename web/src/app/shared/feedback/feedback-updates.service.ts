import { Injectable, effect, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OwnFeedbackUpdatesSchema } from '@poker/shared';
import { interval } from 'rxjs';
import { resolveApiUrl } from '@core/api/api-url';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Tracks whether the visitor's own feedback has news: a human status change or an admin reply. */
@Injectable({
  providedIn: 'root',
})
export class FeedbackUpdatesService {
  private readonly apiUrl = resolveApiUrl();
  private generation = 0;

  readonly hasUpdates = signal(false);

  /**
   * Checks for news whenever a signal read by `active` changes while it returns true, and every
   * few minutes while it does and the page is visible. Call from an injection context; checking
   * stops when that context is destroyed.
   */
  watch(active: () => boolean): void {
    effect(() => {
      if (active()) untracked(() => void this.refresh());
    });
    interval(UPDATE_CHECK_INTERVAL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (active() && !document.hidden) void this.refresh();
      });
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation;
    try {
      const response = await fetch(this.apiUrl + '/api/feedback/mine/updates', {
        credentials: 'include',
        cache: 'no-store',
      });
      // Visitors without feedback access simply have nothing to see.
      if (!response.ok) {
        if (generation === this.generation) this.hasUpdates.set(false);
        return;
      }
      const parsed = OwnFeedbackUpdatesSchema.safeParse(await response.json());
      if (generation === this.generation) this.hasUpdates.set(parsed.data?.hasUpdates ?? false);
    } catch {
      // A missed check is harmless; the next one catches up.
    }
  }
}
