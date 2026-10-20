import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SitePasswordGateComponent } from '@features/access/site-password-gate.component';
import { AppUpdateService } from '@core/update/app-update.service';
import { SiteAccessService } from '@core/access/site-access.service';
import { SiteConfigService } from '@core/config/site-config.service';

/**
 * Pages anyone may open before entering the site password. The admin page has
 * its own password, so an operator can reach it on a locked site.
 */
const OPEN_PATHS = new Set(['/terms', '/privacy', '/admin']);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SitePasswordGateComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly appUpdateService = inject(AppUpdateService);
  private readonly access = inject(SiteAccessService);
  private readonly router = inject(Router);
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** The whole app waits behind the password page, except the legal pages. */
  protected readonly locked = computed(
    () => this.access.siteLocked() && !OPEN_PATHS.has(this.path().split(/[?#]/)[0] ?? ''),
  );

  constructor() {
    const siteName = inject(SiteConfigService).siteName;
    const title = inject(Title);
    effect(() => title.setTitle(`${siteName()} | Real-time planning poker for agile teams`));
  }
}
