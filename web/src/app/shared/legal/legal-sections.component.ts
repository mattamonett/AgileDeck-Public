import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LegalSection } from '@poker/shared';

/**
 * Renders terms or privacy sections as headed paragraphs. Operators can supply
 * this text, so it is only ever interpolated as text, never as HTML; line
 * breaks inside a paragraph are kept.
 */
@Component({
  selector: 'app-legal-sections',
  template: `
    @for (section of sections(); track $index) {
      <section class="legal-section">
        @if (section.heading) {
          <h3>{{ section.heading }}</h3>
        }
        @for (paragraph of section.paragraphs; track $index) {
          <p>{{ paragraph }}</p>
        }
      </section>
    }
  `,
  styles: `
    .legal-section h3 {
      margin: 0 0 0.4rem;
      font-size: 1rem;
    }
    .legal-section p {
      margin: 0 0 0.6rem;
      line-height: 1.5;
      white-space: pre-line;
    }
    .legal-section + .legal-section {
      margin-top: 1rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalSectionsComponent {
  readonly sections = input.required<readonly LegalSection[]>();
}
