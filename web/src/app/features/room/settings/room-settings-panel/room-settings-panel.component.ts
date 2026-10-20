import { RoomMoodSchema, THEMES, type RoomMood, type ThemeDefinition } from '@poker/shared';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { HealthStatus, Room, User } from '../../state/poker.models';

interface MoodOption {
  readonly value: RoomMood;
  readonly label: string;
  /** What the mood does while throwing is on, and while it is off. */
  readonly hint: string;
  readonly hintWithoutThrows: string;
}

const ROOM_MOODS: readonly MoodOption[] = [
  {
    value: 'friendly',
    label: 'Friendly',
    hint: 'Friendly hides crude, violent and political throwables and keeps nudges to a chime.',
    hintWithoutThrows: 'Friendly keeps nudges to a chime.',
  },
  {
    value: 'playful',
    label: 'Playful',
    hint: 'Playful allows every throwable and escalates repeat nudges to a horn and a spoken reminder.',
    hintWithoutThrows: 'Playful escalates repeat nudges to a horn and a spoken reminder.',
  },
  {
    value: 'spicy',
    label: 'Spicy',
    hint: 'Spicy allows every throwable and swaps the spoken reminder for a bleeped one.',
    hintWithoutThrows: 'Spicy escalates repeat nudges to a horn and a bleeped spoken reminder.',
  },
];

@Component({
  selector: 'app-room-settings-panel',
  imports: [DatePipe, FormsModule],
  templateUrl: './room-settings-panel.component.html',
  styleUrl: './room-settings-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomSettingsPanelComponent {
  readonly room = input<Room | null>(null);
  readonly pendingApprovals = input<readonly User[]>([]);
  readonly isConnected = input(true);
  readonly healthStatus = input<HealthStatus | null>(null);
  /** False when the site operator turned the issue backlog off. */
  readonly issuesAvailable = input(true);

  editRoomName = model('');
  editMultiplier = model(1.0);
  /** The themes the site allows; the picker hides when there is no choice. */
  readonly themes = input<readonly ThemeDefinition[]>(THEMES);
  /** The moods the site allows; the picker hides when there is no choice. */
  readonly moods = input<readonly RoomMood[]>(RoomMoodSchema.options);
  readonly defaultMood = input<RoomMood>('playful');
  /** Mood also filters throwables, so the hint only mentions them while throwing is on. */
  readonly throwingEnabled = input(true);
  readonly roomMoods = computed(() =>
    ROOM_MOODS.filter((mood) => this.moods().includes(mood.value)),
  );
  /** Describes only the moods this site offers. */
  readonly moodHint = computed(() =>
    this.roomMoods()
      .map((mood) => (this.throwingEnabled() ? mood.hint : mood.hintWithoutThrows))
      .join(' '),
  );
  readonly currentMood = computed(() => this.room()?.mood ?? this.defaultMood());

  saveRoomName = output<string>();
  toggleAutoReveal = output<'manual' | 'auto'>();
  setTheme = output<string>();
  toggleMultiplier = output<void>();
  saveMultiplier = output<number>();

  approveUser = output<string>();
  denyUser = output<string>();
  refreshHealth = output<void>();
  setIssuesEnabled = output<boolean>();
  setRoomMood = output<RoomMood>();
}
