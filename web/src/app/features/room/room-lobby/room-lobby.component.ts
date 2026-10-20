import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Waiting panel shown while joining the room or waiting for someone to approve the visitor. */
@Component({
  selector: 'app-room-lobby',
  templateUrl: './room-lobby.component.html',
  styleUrl: './room-lobby.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomLobbyComponent {
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly roomId = input.required<string>();
}
