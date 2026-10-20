import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Theme } from '@poker/shared';
import { PlayerCardComponent } from '../player-card/player-card.component';
import { ThrowSceneComponent } from '../../throw-scene/throw-scene.component';
import { ConfettiCelebrationComponent } from '../confetti-celebration/confetti-celebration.component';
import { GardenCelebrationComponent } from '../garden-celebration/garden-celebration.component';
import { BatSwarmComponent } from '../bat-swarm/bat-swarm.component';
import { RevealCelebrationComponent } from '../reveal-celebration/reveal-celebration.component';
import { RoundTimerComponent } from '../round-timer/round-timer.component';
import type { Projectile } from '../../throw-scene/projectile';
import type { RoundClock, User } from '../../state/poker.models';
import { isGardenTheme } from '../../room-theme';

@Component({
  selector: 'app-poker-table',
  imports: [
    PlayerCardComponent,
    ThrowSceneComponent,
    GardenCelebrationComponent,
    ConfettiCelebrationComponent,
    BatSwarmComponent,
    RevealCelebrationComponent,
    RoundTimerComponent,
  ],
  templateUrl: './poker-table.component.html',
  styleUrls: [
    './poker-table.component.css',
    './garden-table.css',
    './vegas-table.css',
    './graveyard-table.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokerTableComponent {
  currentUserId = input<string | null>(null);
  /** The room theme as stored; null or empty means the default garden. */
  theme = input<string | null>(null);
  players = input<readonly User[]>([]);
  observers = input<readonly User[]>([]);
  revealed = input(false);
  isCountdown = input(false);
  countdownValue = input(0);
  hasVotes = input(false);
  isPerfectMatch = input(false);
  averageVote = input<string | number>(0);
  multipliedAverage = input<string | null>(null);
  roundClock = input<RoundClock | null>(null);
  throwBlockedUntil = input(0);
  projectiles = input<readonly Projectile[]>([]);
  selectedProjectile = input('📄');
  /** False when the site turned throwing off or nothing here can be thrown. */
  throwingEnabled = input(true);
  nudgedUserId = input<string | null>(null);
  /** Seconds until each recently nudged player can be nudged again. */
  nudgeCooldowns = input<ReadonlyMap<string, number>>(new Map());

  readonly isGardenTheme = computed(() => isGardenTheme(this.theme()));
  readonly isGraveyardTheme = computed(() => this.theme() === Theme.GRAVEYARD);
  readonly ceremonyLabel = computed(() => {
    switch (this.theme()) {
      case Theme.VEGAS:
        return 'No more bets';
      case Theme.GRAVEYARD:
        return 'Final resting estimate';
      default:
        return 'Final reveal';
    }
  });
  /**
   * Players the room is waiting on, other than the person looking. Nobody is a
   * straggler until someone has voted, so a fresh round isn't covered in megaphones.
   */
  readonly stragglerIds = computed(() => {
    if (this.revealed() || this.isCountdown() || !this.hasVotes()) return new Set<string>();
    return new Set(
      this.players()
        .filter((user) => !user.hasVoted && user.id !== this.currentUserId())
        .map((user) => user.id),
    );
  });

  reveal = output<void>();
  resetGame = output<void>();
  throw = output<string>();
  /** Seconds until anyone left can be nudged, or 0 while at least one straggler is free. */
  readonly stragglersCooldown = computed(() => {
    const cooldowns = this.nudgeCooldowns();
    let soonest = Infinity;
    for (const id of this.stragglerIds()) {
      const seconds = cooldowns.get(id) ?? 0;
      if (seconds === 0) return 0;
      soonest = Math.min(soonest, seconds);
    }
    return Number.isFinite(soonest) ? soonest : 0;
  });

  requestNudgeStragglers(): void {
    if (this.stragglersCooldown() > 0) return;
    this.nudgeStragglers.emit();
  }

  barrage = output<string>();
  openPicker = output<void>();
  nudge = output<string>();
  nudgeStragglers = output<void>();
}
