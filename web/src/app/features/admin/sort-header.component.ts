import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AdminSortDirection } from '@poker/shared';
import { sortAria, sortIndicator } from './sort';

/** A sortable column header: `<th [appSortColumn]="'name'" label="Name" ...>`. */
@Component({
  // A header cell has to stay a <th> for table semantics, so this matches an attribute.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'th[appSortColumn]',
  template: `<button
    class="sort-button"
    type="button"
    [disabled]="disabled()"
    (click)="sort.emit()"
  >
    {{ label() }}<span aria-hidden="true">{{ indicator() }}</span>
  </button>`,
  styleUrls: ['./admin-shared.css', './sort-header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { scope: 'col', '[attr.aria-sort]': 'ariaSort()' },
})
export class SortHeaderComponent {
  readonly appSortColumn = input.required<string>();
  readonly label = input.required<string>();
  readonly activeSort = input.required<string>();
  readonly direction = input.required<AdminSortDirection>();
  readonly disabled = input(false);
  readonly sort = output<void>();

  readonly ariaSort = computed(() =>
    sortAria(this.activeSort(), this.appSortColumn(), this.direction()),
  );
  readonly indicator = computed(() =>
    sortIndicator(this.activeSort(), this.appSortColumn(), this.direction()),
  );
}
