import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AdminSortDirection } from '@poker/shared';
import { SortHeaderComponent } from './sort-header.component';

@Component({
  imports: [SortHeaderComponent],
  template: `<table>
    <thead>
      <tr>
        <th
          [appSortColumn]="'name'"
          label="Name"
          [activeSort]="active()"
          [direction]="direction()"
          [disabled]="disabled()"
          (sort)="clicks.set(clicks() + 1)"
        ></th>
      </tr>
    </thead>
  </table>`,
})
class SortHeaderHost {
  readonly active = signal('name');
  readonly direction = signal<AdminSortDirection>('asc');
  readonly disabled = signal(false);
  readonly clicks = signal(0);
}

describe('SortHeaderComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('stays a column header cell and reflects the sort state', () => {
    const fixture = TestBed.createComponent(SortHeaderHost);
    fixture.detectChanges();
    const th: HTMLElement = fixture.nativeElement.querySelector('th');
    const button = th.querySelector('button');
    expect(th.getAttribute('scope')).toBe('col');
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    expect(button?.className).toBe('sort-button');
    expect(button?.textContent?.trim()).toBe('Name ↑');

    fixture.componentInstance.direction.set('desc');
    fixture.detectChanges();
    expect(th.getAttribute('aria-sort')).toBe('descending');
    fixture.componentInstance.active.set('createdAt');
    fixture.detectChanges();
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(button?.textContent?.trim()).toBe('Name ↕');
  });

  it('emits clicks unless disabled', () => {
    const fixture = TestBed.createComponent(SortHeaderHost);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(1);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});
