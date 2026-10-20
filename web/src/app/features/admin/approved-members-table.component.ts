import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AdminApprovalSort, AdminApprovedMember, AdminSortDirection } from '@poker/shared';
import { SortHeaderComponent } from './sort-header.component';

/** The remembered approvals of one room, sortable by column. */
@Component({
  selector: 'app-approved-members-table',
  imports: [DatePipe, SortHeaderComponent],
  templateUrl: './approved-members-table.component.html',
  styleUrl: './admin-shared.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: block; }',
})
export class ApprovedMembersTableComponent {
  readonly roomName = input.required<string>();
  readonly members = input.required<readonly AdminApprovedMember[]>();
  readonly sort = input.required<AdminApprovalSort>();
  readonly direction = input.required<AdminSortDirection>();
  readonly loading = input(false);
  /** The last load failed, so an empty list means "unknown" rather than "none". */
  readonly unavailable = input(false);
  readonly sortBy = output<AdminApprovalSort>();
  readonly deleteMember = output<AdminApprovedMember>();
}
