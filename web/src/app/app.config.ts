import { ApplicationConfig, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { SiteAccessService } from '@core/access/site-access.service';
import { SiteConfigService } from '@core/config/site-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAppInitializer(() => {
      const siteConfig = inject(SiteConfigService);
      const access = inject(SiteAccessService);
      return siteConfig.load().then(() => access.refresh());
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
