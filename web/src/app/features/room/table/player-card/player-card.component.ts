import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  input,
  output,
  signal,
  effect,
  inject,
  computed,
} from '@angular/core';
import type { User } from '../../state/poker.store';

@Component({
  selector: 'app-player-card',
  imports: [],
  templateUrl: './player-card.component.html',
  styleUrls: [
    './player-card.component.css',
    './garden-player.css',
    './vegas-player.css',
    './observer-player.css',
    './overheated-player.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'handleCardClick($event)',
    '(pointerdown)': 'handlePointerDown($event)',
    '(pointerup)': 'handlePointerUp()',
    '(pointercancel)': 'handlePointerCancel()',
    '(mouseleave)': 'handleMouseLeave()',
  },
})
export class PlayerCardComponent {
  private readonly destroyRef = inject(DestroyRef);

  user = input.required<User>();
  revealState = input(false);
  garden = input(false);
  isCurrent = input(false);
  throwBlockedUntil = input(0);
  /** False when the site turned throwing off, so the card is not a throw target. */
  throwable = input(true);
  /** The room is waiting on this player's vote, so others may nudge them. */
  nudgeable = input(false);
  nudged = input(false);
  /** Seconds until this player can be nudged again; the server ignores nudges until then. */
  nudgeCooldownSeconds = input(0);
  readonly nudgeLabel = computed(() => {
    const seconds = this.nudgeCooldownSeconds();
    const name = this.user().name;
    return seconds > 0
      ? `${name} was just nudged. You can nudge again in ${seconds}s.`
      : `Nudge ${name} to vote`;
  });
  private readonly now = signal(Date.now());
  readonly overheatSeconds = computed(() =>
    Math.max(0, Math.ceil(((this.user().throwOverheat?.until ?? 0) - this.now()) / 1000)),
  );
  readonly heatPercent = computed(() => {
    const heat = this.user().throwOverheat;
    if (!heat || heat.until <= heat.startedAt) return 0;
    return Math.max(
      0,
      Math.min(100, ((heat.until - this.now()) / (heat.until - heat.startedAt)) * 100),
    );
  });
  readonly heatDurationSeconds = computed(() => {
    const heat = this.user().throwOverheat;
    return heat ? (heat.until - heat.startedAt) / 1000 : 0;
  });
  readonly throwingBlocked = computed(() => this.throwBlockedUntil() > this.now());
  /** Another player's card during voting, while the site allows throwing. */
  readonly isTarget = computed(() => this.throwable() && !this.isCurrent() && !this.revealState());

  throw = output<void>();
  barrage = output<void>();
  nudge = output<void>();

  barrageProgress = signal(0);
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private readonly timeoutIds = new Set<ReturnType<typeof setTimeout>>();
  private holdStartTime = 0;
  private barrageTriggered = false;
  private isCardPress = false;
  private cancelledPress = false;
  private readonly BARRAGE_HOLD_TIME = 2000; // 2 seconds feels snappier than 3

  constructor() {
    effect((onCleanup) => {
      const until = Math.max(this.user().throwOverheat?.until ?? 0, this.throwBlockedUntil());
      this.now.set(Date.now());
      if (until <= Date.now()) return;
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (Date.now() >= until) clearInterval(timer);
      }, 100);
      onCleanup(() => clearInterval(timer));
    });
    effect(() => {
      if (this.revealState() || this.isCurrent() || this.throwingBlocked()) {
        this.cancelHold();
        this.isCardPress = false;
      }
    });
    this.destroyRef.onDestroy(() => {
      this.cancelHold();
      for (const timeoutId of this.timeoutIds) {
        clearTimeout(timeoutId);
      }
      this.timeoutIds.clear();
    });
  }

  private setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const timeoutId = setTimeout(() => {
      this.timeoutIds.delete(timeoutId);
      callback();
    }, delay);
    this.timeoutIds.add(timeoutId);
    return timeoutId;
  }

  handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    this.cancelledPress = false;
    if (!this.canThrow() || this.isInteractiveElement(event.target)) {
      return;
    }

    this.isCardPress = true;
    this.beginHold();
  }

  handlePointerUp() {
    if (!this.isCardPress) {
      return;
    }

    this.isCardPress = false;
    this.cancelHold();
  }

  handlePointerCancel() {
    this.cancelledPress = true;
    this.isCardPress = false;
    this.cancelHold();
  }

  handleMouseLeave() {
    if (this.isCardPress) {
      this.isCardPress = false;
      this.cancelHold();
    }
  }

  handleCardClick(event: Event) {
    if (this.cancelledPress) {
      this.cancelledPress = false;
      return;
    }
    if (!this.canThrow() || this.isInteractiveElement(event.target)) {
      return;
    }

    // A long press fires the barrage; ignore its trailing click event.
    if (this.barrageTriggered) {
      this.barrageTriggered = false;
      this.holdStartTime = 0;
      return;
    }

    this.throwSingle();
  }

  private beginHold() {
    this.cancelHold();
    this.holdStartTime = Date.now();
    this.barrageProgress.set(0);
    this.barrageTriggered = false;

    const step = 50;
    this.progressInterval = setInterval(() => {
      const elapsed = Date.now() - this.holdStartTime;
      const progress = Math.min((elapsed / this.BARRAGE_HOLD_TIME) * 100, 100);
      this.barrageProgress.set(progress);

      if (progress >= 100) {
        this.triggerBarrage();
      }
    }, step);

    this.holdTimer = this.setTimer(() => {
      this.triggerBarrage();
    }, this.BARRAGE_HOLD_TIME);
  }

  cancelHold() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.timeoutIds.delete(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    // Don't reset progress immediately so user sees it empty on next hold
    this.setTimer(() => {
      if (!this.holdTimer) this.barrageProgress.set(0);
    }, 100);
  }

  private triggerBarrage() {
    if (!this.holdTimer || !this.canThrow()) return;

    this.barrageTriggered = true;
    this.barrage.emit();
    this.cancelHold();
  }

  private throwSingle() {
    const elapsed = Date.now() - this.holdStartTime;
    if (this.holdStartTime === 0 || elapsed < this.BARRAGE_HOLD_TIME) {
      this.throw.emit();
    }
  }

  requestNudge() {
    if (this.nudgeCooldownSeconds() > 0) return;
    this.nudge.emit();
  }

  handleKeyboardThrow(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.canThrow()) {
      this.throw.emit();
    }
  }

  private canThrow(): boolean {
    return this.isTarget() && !this.throwingBlocked();
  }

  private isInteractiveElement(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('button, input, select, textarea, a');
  }
}
