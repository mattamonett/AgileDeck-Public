import { DatePipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ElementRef,
  viewChild,
  signal,
} from '@angular/core';
import {
  AdminRoomDetailSchema,
  AdminRoomPageSchema,
  THEMES,
  type AdminRoom,
  type AdminApprovedMember,
  type AdminRoomSort,
  type AdminUserSort,
  type AdminApprovalSort,
  type AdminSortDirection,
  type AdminRoomUser,
} from '@poker/shared';

import { ApprovedMembersTableComponent } from './approved-members-table.component';
import { ParticipantsTableComponent } from './participants-table.component';
import { nextSortDirection } from './sort';
import { SortHeaderComponent } from './sort-header.component';
import { apiErrorMessage } from '@core/api/api-request';
import { AdminSessionService } from './admin-session.service';

type DeleteTarget =
  | { kind: 'room'; room: AdminRoom }
  | { kind: 'user'; room: AdminRoom; name: string | null; memberReference: string };

@Component({
  selector: 'app-room-admin',
  imports: [
    DatePipe,
    TitleCasePipe,
    SortHeaderComponent,
    ApprovedMembersTableComponent,
    ParticipantsTableComponent,
  ],
  templateUrl: './room-admin.component.html',
  styleUrls: ['./admin-shared.css', './room-admin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomAdminComponent {
  readonly roomSort = signal<AdminRoomSort>('createdAt');
  readonly roomDirection = signal<AdminSortDirection>('desc');
  readonly userSort = signal<AdminUserSort>('createdAt');
  readonly userDirection = signal<AdminSortDirection>('asc');
  readonly approvalSort = signal<AdminApprovalSort>('name');
  readonly approvalDirection = signal<AdminSortDirection>('asc');
  private readonly session = inject(AdminSessionService);
  readonly rooms = signal<AdminRoom[]>([]);
  readonly selected = signal<AdminRoom | null>(null);
  readonly approvedMembers = signal<AdminApprovedMember[]>([]);
  readonly nextApprovedOffset = signal<number | null>(null);
  readonly users = signal<AdminRoomUser[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly nextUserCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingUsers = signal(false);
  readonly error = signal('');
  readonly userError = signal('');
  readonly deleteTarget = signal<DeleteTarget | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  askDeleteRoom(room: AdminRoom): void {
    this.deleteTarget.set({ kind: 'room', room });
    this.deleteError.set('');
    this.deleteDialog().nativeElement.showModal();
  }

  askDeleteUser(
    room: AdminRoom,
    user: Pick<AdminApprovedMember, 'name' | 'memberReference'>,
  ): void {
    this.deleteTarget.set({
      kind: 'user',
      room,
      name: user.name,
      memberReference: user.memberReference,
    });
    this.deleteError.set('');
    this.deleteDialog().nativeElement.showModal();
  }

  cancelDelete(event?: Event): void {
    if (this.deleting()) {
      event?.preventDefault();
      return;
    }
    this.deleteDialog().nativeElement.close();
    this.deleteTarget.set(null);
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set('');
    try {
      const path =
        '/' +
        encodeURIComponent(target.room.id) +
        (target.kind === 'user' ? '/members/' + encodeURIComponent(target.memberReference) : '');
      const body =
        target.kind === 'room'
          ? { name: target.room.name, approvedMemberCount: target.room.approvedMemberCount }
          : { name: target.name };
      const response = await this.session.fetch('/rooms' + path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(await response.json()) ?? 'Could not delete. Please try again.',
        );
      }
      ++this.listGeneration;
      this.loading.set(false);
      this.close();
      this.deleteDialog().nativeElement.close();
      this.deleteTarget.set(null);
      await this.load();
      if (target.kind === 'user') await this.select(target.room);
    } catch (error) {
      this.deleteError.set(
        error instanceof Error ? error.message : 'Could not delete. Please try again.',
      );
    } finally {
      this.deleting.set(false);
    }
  }

  private listGeneration = 0;
  private userGeneration = 0;

  themeName(theme: string): string {
    return THEMES.find((entry) => entry.id === theme)?.name ?? theme;
  }

  constructor() {
    void this.load();
  }

  async sortRooms(column: AdminRoomSort): Promise<void> {
    if (this.loading()) return;
    this.roomDirection.set(nextSortDirection(this.roomSort(), this.roomDirection(), column));
    this.roomSort.set(column);
    await this.load();
  }

  async sortUsers(column: AdminUserSort): Promise<void> {
    const room = this.selected();
    if (!room || this.loadingUsers()) return;
    this.userDirection.set(nextSortDirection(this.userSort(), this.userDirection(), column));
    this.userSort.set(column);
    await this.select(room);
  }

  async sortApprovals(column: AdminApprovalSort): Promise<void> {
    const room = this.selected();
    if (!room || this.loadingUsers()) return;
    this.approvalDirection.set(
      nextSortDirection(this.approvalSort(), this.approvalDirection(), column),
    );
    this.approvalSort.set(column);
    await this.select(room);
  }

  private async request(url: string): Promise<unknown> {
    return this.session.request('/rooms' + url, 'Could not load rooms.');
  }

  async load(more = false): Promise<void> {
    if (this.loading()) return;
    const cursor = more ? this.nextCursor() : null;
    if (more && !cursor) return;
    const generation = ++this.listGeneration;
    this.loading.set(true);
    this.error.set('');
    try {
      const query = new URLSearchParams({ sort: this.roomSort(), direction: this.roomDirection() });
      if (cursor) query.set('cursor', cursor);
      const page = AdminRoomPageSchema.safeParse(await this.request('?' + query.toString()));
      if (!page.success) throw new Error('Could not load rooms. Refresh the page and try again.');
      if (generation !== this.listGeneration) return;
      this.rooms.update((rooms) => (more ? [...rooms, ...page.data.items] : page.data.items));
      this.nextCursor.set(page.data.nextCursor);
    } catch (error) {
      if (generation === this.listGeneration)
        this.error.set(error instanceof Error ? error.message : 'Could not load rooms.');
    } finally {
      if (generation === this.listGeneration) this.loading.set(false);
    }
  }

  async select(room: AdminRoom, more = false, moreApproved = false): Promise<void> {
    const approvedOffset = moreApproved ? this.nextApprovedOffset() : null;
    if (
      moreApproved &&
      (approvedOffset === null || this.loadingUsers() || this.selected()?.id !== room.id)
    )
      return;
    const cursor = more ? this.nextUserCursor() : null;
    if (more && (!cursor || this.loadingUsers() || this.selected()?.id !== room.id)) return;
    const generation = ++this.userGeneration;
    this.selected.set(room);
    this.loadingUsers.set(true);
    this.userError.set('');
    if (!more && !moreApproved) {
      this.approvedMembers.set([]);
      this.nextApprovedOffset.set(null);
      this.users.set([]);
      this.nextUserCursor.set(null);
    }
    try {
      const query = new URLSearchParams({
        memberSort: this.userSort(),
        memberDirection: this.userDirection(),
        approvedSort: this.approvalSort(),
        approvedDirection: this.approvalDirection(),
      });
      if (cursor) query.set('cursor', cursor);
      if (approvedOffset !== null) query.set('approvedOffset', String(approvedOffset));
      const detail = AdminRoomDetailSchema.safeParse(
        await this.request('/' + encodeURIComponent(room.id) + '?' + query.toString()),
      );
      if (!detail.success)
        throw new Error('Could not load room members. Refresh the page and try again.');
      if (generation !== this.userGeneration) return;
      this.selected.set(detail.data.room);
      this.rooms.update((rooms) =>
        rooms.map((entry) => (entry.id === detail.data.room.id ? detail.data.room : entry)),
      );
      if (!moreApproved) {
        this.users.update((users) => (more ? [...users, ...detail.data.users] : detail.data.users));
        this.nextUserCursor.set(detail.data.nextCursor);
      }
      if (!more) {
        this.approvedMembers.update((members) =>
          moreApproved ? [...members, ...detail.data.approvedMembers] : detail.data.approvedMembers,
        );
        this.nextApprovedOffset.set(detail.data.nextApprovedOffset);
      }
    } catch (error) {
      if (generation === this.userGeneration)
        this.userError.set(error instanceof Error ? error.message : 'Could not load room members.');
    } finally {
      if (generation === this.userGeneration) this.loadingUsers.set(false);
    }
  }

  close(): void {
    ++this.userGeneration;
    this.selected.set(null);
    this.approvedMembers.set([]);
    this.nextApprovedOffset.set(null);
    this.users.set([]);
    this.loadingUsers.set(false);
    this.userError.set('');
    this.nextUserCursor.set(null);
  }
}
