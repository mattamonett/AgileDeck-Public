import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { NudgeLevel, RoomMood } from '@poker/shared';
import { InteractionService } from '../../services/interaction.service';
import { NudgeSoundService } from '../../services/nudge-sound.service';
import { PokerStore } from '../../state/poker.store';

const TITLE_FLASH = '🔔 Your vote';
const TITLE_FLASH_MS = 1_000;

interface ActiveNudge {
  readonly level: NudgeLevel;
  readonly from: string;
  readonly seq: number;
}

/** Tells the person the room is waiting on them, until they vote or wave it away. */
@Component({
  selector: 'app-nudge-alert',
  templateUrl: './nudge-alert.component.html',
  styleUrl: './nudge-alert.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NudgeAlertComponent {
  private readonly interaction = inject(InteractionService);
  private readonly store = inject(PokerStore);
  private readonly document = inject(DOCUMENT);
  readonly sound = inject(NudgeSoundService);

  readonly currentUserId = input<string | null>(null);
  readonly mood = input<RoomMood>('playful');
  /** The room theme as stored, which picks the nudge tone. */
  readonly theme = input<string | undefined>(undefined);
  /** True while this person is a player the room is still waiting on. */
  readonly waitingOnMe = input(false);

  readonly active = signal<ActiveNudge | null>(null);
  readonly headline = computed(() => {
    const level = this.active()?.level;
    return level === 3 ? 'VOTE!' : level === 2 ? 'Still waiting on you!' : 'Your vote, please';
  });

  constructor() {
    effect(() => {
      const nudge = this.interaction.lastNudge();
      if (!nudge || nudge.event.targetUserId !== this.currentUserId()) return;
      untracked(() => {
        if (!this.waitingOnMe()) return;
        const from =
          this.store.users().find((user) => user.id === nudge.event.sourceUserId)?.name ??
          'Someone';
        this.active.set({ level: nudge.event.level, from, seq: nudge.seq });
        this.sound.play(nudge.event.level, this.mood(), this.theme());
      });
    });
    effect(() => {
      if (!this.waitingOnMe()) untracked(() => this.dismiss());
    });
    effect((onCleanup) => {
      if (!this.active()) return;
      const original = untracked(() => this.document.title);
      let flashing = false;
      const timer = setInterval(() => {
        flashing = !flashing;
        this.document.title = flashing ? TITLE_FLASH : original;
      }, TITLE_FLASH_MS);
      onCleanup(() => {
        clearInterval(timer);
        this.document.title = original;
      });
    });
  }

  dismiss(): void {
    if (!this.active()) return;
    this.active.set(null);
    this.sound.stop();
  }

  mute(): void {
    this.sound.setSetting('off');
  }
}
