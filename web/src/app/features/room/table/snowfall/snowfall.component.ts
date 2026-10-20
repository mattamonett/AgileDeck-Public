import { ChangeDetectionStrategy, Component } from '@angular/core';

const FLAKE_COUNT = 24;

/** A flurry of snow falling over the table on a perfect match in Fireside Cabin. */
@Component({
  selector: 'app-snowfall',
  templateUrl: './snowfall.component.html',
  styleUrl: './snowfall.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnowfallComponent {
  // Spread the flakes across the table and stagger them so they fall as a flurry, not a sheet.
  protected readonly flakes = Array.from({ length: FLAKE_COUNT }, (_, index) => ({
    left: 3 + ((index * 41) % 94),
    sway: ((index * 29) % 9) - 4,
    delay: ((index * 13) % 20) / 10,
    duration: 3 + ((index * 7) % 5) / 4,
  }));
}
