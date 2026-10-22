import { ChangeDetectionStrategy, Component, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { projectileName } from '../../projectile-names';
import {
  isChristmasProjectile,
  isHalloweenProjectile,
  isNewThrowable,
  isThanksgivingProjectile,
  type EmojiDefinition,
} from '@poker/shared';

@Component({
  selector: 'app-emoji-picker',
  imports: [FormsModule],
  templateUrl: './emoji-picker.component.html',
  styleUrl: './emoji-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmojiPickerComponent {
  readonly projectileName = projectileName;
  readonly isHalloweenProjectile = isHalloweenProjectile;
  christmasEmojis = computed(() =>
    this.allEmojis().filter(({ char }) => isChristmasProjectile(char)),
  );
  thanksgivingEmojis = computed(() =>
    this.allEmojis().filter(({ char }) => isThanksgivingProjectile(char)),
  );
  seasonalLabel(char: string): string {
    if (isChristmasProjectile(char)) return ' · December only (UTC)';
    return isHalloweenProjectile(char)
      ? ' · October only'
      : isThanksgivingProjectile(char)
        ? ' · November only'
        : '';
  }
  halloweenEmojis = computed(() =>
    this.allEmojis().filter(({ char }) => isHalloweenProjectile(char)),
  );
  title = input('Select Emoji');
  presets = input<readonly string[]>([]);
  allEmojis = input<readonly EmojiDefinition[]>([]);
  emojiSelect = output<string>();
  closePicker = output<void>();

  searchQuery = signal('');

  private readonly openedAt = new Date();
  newEmojis = computed(() => this.allEmojis().filter((e) => isNewThrowable(e, this.openedAt)));
  private readonly newChars = computed(() => new Set(this.newEmojis().map((e) => e.char)));
  isNew(char: string): boolean {
    return this.newChars().has(char);
  }

  filteredEmojis = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const emojis = this.allEmojis();
    if (!query) {
      return emojis
        .filter(
          (e) =>
            !isChristmasProjectile(e.char) &&
            !isHalloweenProjectile(e.char) &&
            !isThanksgivingProjectile(e.char),
        )
        .map((e) => e.char);
    }
    return emojis.filter((e) => e.tags.includes(query) || e.char === query).map((e) => e.char);
  });
}
