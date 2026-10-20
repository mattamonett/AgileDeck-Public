import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteConfigService } from '@core/config/site-config.service';
import { LegalSectionsComponent } from './legal-sections.component';

/** Scrollable copy of the full site use agreement shown beside its acceptance checkbox. */
@Component({
  selector: 'app-site-agreement',
  imports: [LegalSectionsComponent, RouterLink],
  template: `
    <div class="agreement-scroll" tabindex="0" role="region" aria-label="Site use agreement">
      <app-legal-sections [sections]="sections()" />
    </div>
    <p class="agreement-links">
      Read the <a routerLink="/privacy" target="_blank">privacy notice</a> or open the
      <a routerLink="/terms" target="_blank">full agreement</a> in a new tab.
    </p>
  `,
  styles: `
    .agreement-scroll {
      max-height: 12rem;
      overflow-y: auto;
      padding-right: 0.5rem;
      font-size: 0.9rem;
    }
    .agreement-links {
      margin: 0.5rem 0 0.75rem;
      font-size: 0.9rem;
    }
    .agreement-links a {
      color: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteAgreementComponent {
  private readonly siteConfig = inject(SiteConfigService);
  readonly sections = computed(() => this.siteConfig.config().legal.terms);
}
