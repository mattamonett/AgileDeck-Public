import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SiteConfigService } from '@core/config/site-config.service';
import { AppUpdateService } from './app-update.service';
import { VersionCheckService } from './version-check.service';

/** Sticky banner offering a reload once a newer build has been deployed. */
@Component({
  selector: 'app-update-banner',
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerComponent {
  protected readonly versionCheck = inject(VersionCheckService);
  protected readonly appUpdate = inject(AppUpdateService);
  protected readonly siteName = inject(SiteConfigService).siteName;
}
