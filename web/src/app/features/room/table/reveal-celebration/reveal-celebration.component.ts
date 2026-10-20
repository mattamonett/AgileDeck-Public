import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const SPARK_COUNT = 16;

/** The burst of sparks over the table when cards are revealed, with a banner in Las Vegas and Graveyard Shift. */
@Component({
  selector: 'app-reveal-celebration',
  templateUrl: './reveal-celebration.component.html',
  styleUrl: './reveal-celebration.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevealCelebrationComponent {
  readonly vegas = input(false);
  readonly graveyard = input(false);
  protected readonly sparkAngles = Array.from(
    { length: SPARK_COUNT },
    (_, index) => (index * 360) / SPARK_COUNT,
  );
}
