import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { Theme, THEMES } from '@poker/shared';
import type { RoundClock } from '../../state/poker.models';

const LABELS: Readonly<Record<Theme, { running: string; stopped: string }>> = {
  [Theme.GARDEN]: { running: 'Round', stopped: 'Round took' },
  [Theme.SPACE]: { running: 'Mission T+', stopped: 'Landed T+' },
  [Theme.RETRO]: { running: '> round', stopped: '> halted' },
  [Theme.VEGAS]: { running: 'On the clock', stopped: 'Final time' },
  [Theme.GRAVEYARD]: { running: 'Graveyard shift', stopped: 'Time of death' },
};

export function formatRoundTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

@Component({
  selector: 'app-round-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (time(); as time) {
      <span class="dial" aria-hidden="true">
        <span class="hand" [style.transform]="'rotate(' + sweep() + 'deg)'"></span>
      </span>
      <span class="label">{{ label() }}</span
      >&ngsp;<time class="digits">{{ time }}</time>
    }
  `,
  host: {
    role: 'timer',
    '[attr.data-look]': 'themeId()',
    '[class.stopped]': '!running()',
  },
  styleUrl: './round-timer.component.css',
})
export class RoundTimerComponent {
  readonly clock = input<RoundClock | null>(null);
  readonly theme = input<string>(Theme.GARDEN);
  private readonly now = signal(Date.now());
  readonly themeId = computed(
    () => THEMES.find((theme) => theme.id === this.theme())?.id ?? Theme.GARDEN,
  );
  readonly running = computed(() => this.clock()?.stoppedAt === null);
  readonly label = computed(() => {
    const labels = LABELS[this.themeId()];
    return this.running() ? labels.running : labels.stopped;
  });
  private readonly elapsedMs = computed(() => {
    const clock = this.clock();
    return clock ? (clock.stoppedAt ?? this.now()) - clock.startedAt : null;
  });
  readonly time = computed(() => {
    const elapsedMs = this.elapsedMs();
    return elapsedMs === null ? null : formatRoundTime(elapsedMs);
  });
  // Cumulative degrees so the hand only ever moves forward between ticks.
  readonly sweep = computed(() => Math.floor(Math.max(0, this.elapsedMs() ?? 0) / 1000) * 6);

  constructor() {
    effect((onCleanup) => {
      const clock = this.clock();
      if (!clock || clock.stoppedAt !== null) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = () => {
        const now = Date.now();
        this.now.set(now);
        // Wake just after each whole second of the round so every client's display turns over together.
        const intoSecond = (((now - clock.startedAt) % 1000) + 1000) % 1000;
        timer = setTimeout(tick, 1010 - intoSecond);
      };
      tick();
      onCleanup(() => clearTimeout(timer));
    });
  }
}
