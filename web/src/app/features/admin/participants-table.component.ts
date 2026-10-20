import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AdminRoomUser, AdminSortDirection, AdminUserSort } from '@poker/shared';
import { SortHeaderComponent } from './sort-header.component';

/** The people currently in one room, including pending approvals, sortable by column. */
@Component({
  selector: 'app-participants-table',
  imports: [DatePipe, SortHeaderComponent],
  templateUrl: './participants-table.component.html',
  styleUrl: './admin-shared.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: block; }',
})
export class ParticipantsTableComponent {
  readonly roomName = input.required<string>();
  readonly members = input.required<readonly AdminRoomUser[]>();
  readonly sort = input.required<AdminUserSort>();
  readonly direction = input.required<AdminSortDirection>();
  readonly loading = input(false);
  /** The last load failed, so an empty list means "unknown" rather than "none". */
  readonly unavailable = input(false);
  readonly sortBy = output<AdminUserSort>();
  readonly deleteMember = output<AdminRoomUser>();
}
