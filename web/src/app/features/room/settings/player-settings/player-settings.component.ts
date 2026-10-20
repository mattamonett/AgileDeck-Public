import { readLocalPreference, writeLocalPreference } from '@core/storage/local-preference';
import { PLAYER_SEX_STORAGE_KEY } from '@core/storage/storage-keys';
import {
  ChangeDetectionStrategy,
  Component,
  model,
  output,
  signal,
  input,
  linkedSignal,
  ElementRef,
  viewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { NUDGE_SOUND_SETTINGS, type NudgeSoundSetting } from '../../services/nudge-sound.service';

@Component({
  selector: 'app-player-settings',
  imports: [FormsModule],
  templateUrl: './player-settings.component.html',
  styleUrl: './player-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeSexOutside($event)' },
})
export class PlayerSettingsComponent {
  readonly nudgeSoundSettings = NUDGE_SOUND_SETTINGS;
  nudgeSoundSetting = input<NudgeSoundSetting>('loud');
  hasVoice = input(true);
  nudgeSoundChange = output<NudgeSoundSetting>();
  testNudgeSound = output<void>();

  editUserName = model('');
  updateUserName = output<string>();
  toggleObserver = output<void>();
  panelOpen = input(true);
  isObserver = input(false);
  /** Closing the side panel also closes the choices. */
  sexOpen = linkedSignal({ source: this.panelOpen, computation: () => false });
  sex = signal<'Male' | 'Female' | ''>(this.readSex());
  readonly sexChoices = ['Male', 'Female'] as const;
  private readonly sexControl = viewChild<ElementRef<HTMLElement>>('sexControl');
  private readonly sexTrigger = viewChild<ElementRef<HTMLButtonElement>>('sexTrigger');

  private readSex(): 'Male' | 'Female' | '' {
    const value = readLocalPreference(PLAYER_SEX_STORAGE_KEY);
    return value === 'Male' || value === 'Female' ? value : '';
  }

  chooseSex(value: 'Male' | 'Female') {
    this.sex.set(value);
    writeLocalPreference(PLAYER_SEX_STORAGE_KEY, value);
    this.sexOpen.set(false);
    this.sexTrigger()?.nativeElement.focus();
  }

  closeSexOutside(event: MouseEvent) {
    if (!this.sexControl()?.nativeElement.contains(event.target as Node)) this.sexOpen.set(false);
  }

  sexFocusOut(event: FocusEvent) {
    if (!this.sexControl()?.nativeElement.contains(event.relatedTarget as Node))
      this.sexOpen.set(false);
  }

  sexKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.sexOpen.set(false);
      this.sexTrigger()?.nativeElement.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      this.sexOpen.set(true);
      // Focus after Angular has rendered the newly opened choices.
      setTimeout(() => {
        if (!this.sexOpen()) return;
        const options =
          this.sexControl()?.nativeElement.querySelectorAll<HTMLButtonElement>('[role="option"]');
        if (!options?.length) return;
        const current = Array.from(options).indexOf(document.activeElement as HTMLButtonElement);
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : current < 0
                ? event.key === 'ArrowUp'
                  ? 1
                  : 0
                : (current + 1) % 2;
        options[index]?.focus();
      });
    }
  }

  updateName() {
    this.updateUserName.emit(this.editUserName());
  }
}
