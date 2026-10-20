import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Issue, IssueStatus } from './issue.model';

@Component({
  selector: 'app-issue-card',
  imports: [DatePipe, FormsModule],
  templateUrl: './issue-card.component.html',
  styleUrls: ['./issues-shared.css', './issue-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueCardComponent {
  readonly row = input.required<{ issue: Issue; depth: number }>();
  readonly collapsed = input(false);
  readonly detailsCollapsed = input(false);
  readonly deleting = input(false);
  readonly readonly = input(false);
  readonly preview = input(false);
  readonly statuses = [IssueStatus.OPEN, IssueStatus.IN_PROGRESS, IssueStatus.CLOSED];
  readonly labels = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
  readonly statusChange = output<{ id: string; status: IssueStatus }>();
  readonly estimateChange = output<{ id: string; input: HTMLInputElement }>();
  readonly childrenToggle = output<string>();
  readonly detailsToggle = output<string>();
  readonly add = output<string>();
  readonly edit = output<Issue>();
  readonly deleteRequest = output<string>();
  readonly cancelDelete = output<void>();
  readonly removeIssue = output<string>();
  readonly voteRequest = output<string>();
  changeStatus(id: string, status: IssueStatus) {
    this.statusChange.emit({ id, status });
  }
  changeEstimate(id: string, input: HTMLInputElement) {
    this.estimateChange.emit({ id, input });
  }
  toggle(id: string) {
    this.childrenToggle.emit(id);
  }
  toggleDetails(id: string) {
    this.detailsToggle.emit(id);
  }
  startAdd(id: string) {
    this.add.emit(id);
  }
  startEdit(issue: Issue) {
    this.edit.emit(issue);
  }
  remove(id: string) {
    this.removeIssue.emit(id);
  }
}
