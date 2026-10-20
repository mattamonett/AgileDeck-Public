import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-room-header',
  imports: [RouterLink],
  templateUrl: './room-header.component.html',
  styleUrls: ['./room-header.component.css', './garden-header.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomHeaderComponent {
  readonly pendingCount = input(0);
  readonly isConnected = input(true);
  readonly roomSettingsLabel = computed(() => {
    const count = this.pendingCount();
    return count > 0
      ? `Room Settings — ${count} ${count === 1 ? 'person' : 'people'} waiting in the lobby`
      : 'Room Settings';
  });

  readonly feedbackLabel = computed(() =>
    this.hasFeedbackUpdates() ? 'Feedback — updates on your submissions' : 'Feedback',
  );

  roomName = input<string | undefined>(undefined);
  hasFeedbackUpdates = input(false);
  /** False when the site operator turned feedback off. */
  readonly showFeedback = input(true);
  roomId = input('');

  copyLink = output<void>();
  toggleSettings = output<void>();
  toggleRoomSettings = output<void>();
  openQrCode = output<void>();
  openFeedback = output<void>();
}
