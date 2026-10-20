import { ChangeDetectionStrategy, Component } from '@angular/core';

const BAT_COUNT = 14;

/** A swarm of bats bursting out of the table on a perfect match in Graveyard Shift. */
@Component({
  selector: 'app-bat-swarm',
  templateUrl: './bat-swarm.component.html',
  styleUrl: './bat-swarm.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatSwarmComponent {
  // Spread the bats across the table and stagger them so they leave in a flurry, not a line.
  protected readonly bats = Array.from({ length: BAT_COUNT }, (_, index) => ({
    left: 8 + ((index * 37) % 84),
    drift: ((index * 53) % 41) - 20,
    delay: ((index * 7) % 10) / 10,
  }));
}
