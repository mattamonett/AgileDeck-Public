import { ChangeDetectionStrategy, Component } from '@angular/core';

const CONFETTI_COUNT = 20;

/** Confetti falling over the table on a perfect match, for every theme but the garden. */
@Component({
  selector: 'app-confetti-celebration',
  templateUrl: './confetti-celebration.component.html',
  styleUrl: './confetti-celebration.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfettiCelebrationComponent {
  protected readonly pieces = Array.from({ length: CONFETTI_COUNT }, (_, index) => index);
}
