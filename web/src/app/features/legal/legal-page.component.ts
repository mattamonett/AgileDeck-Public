import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { LegalSection, PublicSiteConfig } from '@poker/shared';
import { SiteConfigService } from '@core/config/site-config.service';
import { LegalSectionsComponent } from '@shared/legal/legal-sections.component';

export type LegalPageKind = 'terms' | 'privacy';

interface LegalPage {
  readonly title: string;
  readonly updated: string;
  readonly sections: readonly LegalSection[];
}

function legalPage(kind: LegalPageKind, legal: PublicSiteConfig['legal']): LegalPage {
  return kind === 'terms'
    ? { title: 'Site use agreement', updated: legal.termsUpdated, sections: legal.terms }
    : { title: 'Privacy notice', updated: legal.privacyUpdated, sections: legal.privacy };
}

function isLegalPageKind(value: unknown): value is LegalPageKind {
  return value === 'terms' || value === 'privacy';
}

/** Standalone page for the site use agreement or the privacy notice, chosen by route data. */
@Component({
  selector: 'app-legal-page',
  imports: [LegalSectionsComponent, RouterLink],
  template: `
    <main class="legal-page glass-panel">
      <a routerLink="/" class="back-link">← Back to {{ siteName() }}</a>
      <h1>{{ page().title }}</h1>
      <p class="updated">Last updated {{ page().updated }}</p>
      <app-legal-sections [sections]="page().sections" />
      <nav class="legal-nav" aria-label="Legal">
        <a routerLink="/terms">Site use agreement</a>
        <a routerLink="/privacy">Privacy notice</a>
      </nav>
    </main>
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
    }
    .legal-page {
      max-width: 720px;
      margin: 2rem auto;
      padding: 2rem;
    }
    h1 {
      margin: 0.75rem 0 0.25rem;
    }
    .updated {
      margin: 0 0 1.5rem;
      opacity: 0.75;
    }
    .back-link,
    .legal-nav a {
      color: inherit;
    }
    .legal-nav {
      display: flex;
      gap: 1.25rem;
      margin-top: 2rem;
    }
    @media (max-width: 600px) {
      .legal-page {
        margin: 0;
        padding: 1.25rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPageComponent {
  private readonly kind: unknown = inject(ActivatedRoute).snapshot.data['page'];
  private readonly siteConfig = inject(SiteConfigService);
  readonly siteName = this.siteConfig.siteName;
  readonly page = computed(() =>
    legalPage(isLegalPageKind(this.kind) ? this.kind : 'terms', this.siteConfig.config().legal),
  );
}
