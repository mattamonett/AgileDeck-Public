import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteConfigService } from '@core/config/site-config.service';
import { SitePasswordFormComponent } from '@shared/access/site-password-form.component';

/** Shown instead of the app while the site password protects everything. */
@Component({
  selector: 'app-site-password-gate',
  imports: [RouterLink, SitePasswordFormComponent],
  template: `
    <main class="gate">
      <div class="glass-panel gate-box">
        <h1>{{ siteName() }}</h1>
        <p>This site is private. Enter the password you were given to continue.</p>
        <app-site-password-form prompt="Site password" />
        <nav class="legal-links" aria-label="Legal">
          <a routerLink="/terms">Site use agreement</a>
          <a routerLink="/privacy">Privacy notice</a>
        </nav>
      </div>
    </main>
  `,
  styles: `
    .gate {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .gate-box {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    h1 {
      text-align: center;
      font-size: 1.75rem;
    }
    p {
      margin: 0;
      line-height: 1.5;
    }
    .legal-links {
      display: flex;
      justify-content: center;
      gap: 1.25rem;
      font-size: 0.85rem;
    }
    .legal-links a {
      color: inherit;
      opacity: 0.75;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitePasswordGateComponent {
  readonly siteName = inject(SiteConfigService).siteName;
}
