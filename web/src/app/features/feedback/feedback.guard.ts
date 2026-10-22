import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { ApiPath } from '@poker/shared';
import { resolveApiUrl } from '@core/api/api-url';
import { SiteConfigService } from '@core/config/site-config.service';
import { requestVisitorSession } from '@core/session/visitor-session';

export const feedbackGuard: CanActivateFn = async () => {
  const router = inject(Router);
  if (!inject(SiteConfigService).config().features.feedback) return router.parseUrl('/');
  const apiUrl = resolveApiUrl();
  try {
    const session = await requestVisitorSession(apiUrl);
    if (!session.ok) return router.parseUrl('/');
    const access = await fetch(`${apiUrl}${ApiPath.FEEDBACK}/access`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return access.ok ? true : router.parseUrl('/');
  } catch {
    return router.parseUrl('/');
  }
};
