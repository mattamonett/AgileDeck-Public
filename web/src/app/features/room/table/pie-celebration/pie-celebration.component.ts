import { ChangeDetectionStrategy, Component } from '@angular/core';

const LEAF_COUNT = 16;
const LEAVES = ['🍂', '🍁'] as const;

/** A whole pie served up with a shower of autumn leaves on a perfect match in Harvest Table. */
@Component({
  selector: 'app-pie-celebration',
  templateUrl: './pie-celebration.component.html',
  styleUrl: './pie-celebration.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PieCelebrationComponent {
  // Spread the leaves across the table and stagger them so they drift down, not drop in a line.
  protected readonly leaves = Array.from({ length: LEAF_COUNT }, (_, index) => ({
    char: LEAVES[index % LEAVES.length],
    left: 4 + ((index * 41) % 92),
    drift: ((index * 29) % 31) - 15,
    delay: ((index * 7) % 12) / 10,
  }));
}
