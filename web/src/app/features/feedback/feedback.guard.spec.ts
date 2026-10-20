import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import { feedbackGuard } from './feedback.guard';

describe('feedbackGuard', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'feedback', canActivate: [feedbackGuard], children: [] },
          { path: '', children: [] },
        ]),
      ],
    }),
  );
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function open(): Promise<string> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/feedback');
    return router.url;
  }

  it('sends visitors home without asking the API when feedback is turned off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.inject(SiteConfigService).set({
      ...FALLBACK_SITE_CONFIG,
      features: { ...FALLBACK_SITE_CONFIG.features, feedback: false },
    });
    expect(await open()).toBe('/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the page for visitors the API allows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{}')),
    );
    expect(await open()).toBe('/feedback');
  });
});
