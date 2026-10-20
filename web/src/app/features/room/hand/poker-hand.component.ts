import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-poker-hand',
  imports: [],
  templateUrl: './poker-hand.component.html',
  styleUrls: ['./poker-hand.component.css', './garden-hand.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokerHandComponent {
  private readonly primaryRowCardCount = 17;
  private readonly primaryRowCenter = (this.primaryRowCardCount - 1) / 2;

  cards = input<readonly string[]>([]);
  isObserver = input(false);
  selectedVote = input<string | null>(null);
  revealed = input(false);

  vote = output<string>();
  toggleObserver = output<void>();

  cardFanOffset(index: number): number {
    if (index >= this.primaryRowCardCount) return 0;
    const distanceFromCenter = Math.abs(index - this.primaryRowCenter) / this.primaryRowCenter;
    return Math.round(distanceFromCenter ** 2 * 24);
  }

  cardFanRotation(index: number): number {
    if (index >= this.primaryRowCardCount) return 0;
    return ((index - this.primaryRowCenter) / this.primaryRowCenter) * 5;
  }

  isFibonacci(card: string): boolean {
    const n = parseFloat(card);
    if (isNaN(n)) return false;

    // Check if it's a perfect square of (5n^2 + 4) or (5n^2 - 4)
    // or just check against the known set since cards are fixed
    const fibs = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    return fibs.includes(n);
  }
}
