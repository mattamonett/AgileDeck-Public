import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  ChristmasAvailabilitySchema,
  isChristmasProjectile,
  HalloweenAvailabilitySchema,
  isHalloweenProjectile,
  isSeasonalTheme,
  SeasonalThemeAvailabilitySchema,
  ThanksgivingAvailabilitySchema,
  isThanksgivingProjectile,
  type Theme,
} from '@poker/shared';
import { SocketService } from '@core/socket/socket.service';

@Injectable({ providedIn: 'root' })
export class SeasonalThrowablesService {
  private readonly socket = inject(SocketService);
  private readonly abort = new AbortController();
  readonly christmasAvailable = signal(false);
  readonly available = signal(false);
  readonly thanksgivingAvailable = signal(false);
  /** Seasonal themes the server says are in season; every other theme is always offered. */
  readonly seasonalThemes = signal<readonly Theme[]>([]);

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.abort.abort();
    });
  }

  isAvailable(char: string): boolean {
    if (isChristmasProjectile(char)) return this.christmasAvailable();
    if (isThanksgivingProjectile(char)) return this.thanksgivingAvailable();
    return !isHalloweenProjectile(char) || this.available();
  }

  isThemeAvailable(theme: Theme): boolean {
    return !isSeasonalTheme(theme) || this.seasonalThemes().includes(theme);
  }

  async refresh(): Promise<void> {
    try {
      const response = await fetch(`${this.socket.getApiUrl()}/api/config`, {
        cache: 'no-store',
        credentials: 'include',
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error('Could not load seasonal availability');
      const payload: unknown = await response.json();
      const christmas = ChristmasAvailabilitySchema.safeParse(payload);
      this.christmasAvailable.set(christmas.success && christmas.data.christmasAvailable);
      const parsed = HalloweenAvailabilitySchema.safeParse(payload);
      const thanksgiving = ThanksgivingAvailabilitySchema.safeParse(payload);
      this.thanksgivingAvailable.set(
        thanksgiving.success && thanksgiving.data.thanksgivingAvailable,
      );
      this.available.set(parsed.success && parsed.data.halloweenAvailable);
      const themes = SeasonalThemeAvailabilitySchema.safeParse(payload);
      this.seasonalThemes.set(themes.success ? themes.data.seasonalThemes : []);
    } catch {
      this.christmasAvailable.set(false);
      this.thanksgivingAvailable.set(false);
      this.available.set(false);
      this.seasonalThemes.set([]);
    }
  }
}
