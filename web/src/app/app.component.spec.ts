import { provideRouter } from '@angular/router';
import { AppUpdateService } from '@core/update/app-update.service';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import { Title } from '@angular/platform-browser';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), { provide: AppUpdateService, useValue: {} }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the route outlet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the password page instead of the app while the site is locked', async () => {
    TestBed.inject(SiteConfigService).set({
      ...FALLBACK_SITE_CONFIG,
      site: { ...FALLBACK_SITE_CONFIG.site, name: 'Team Poker' },
      access: { passwordProtects: 'everything' },
    });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeNull();
    expect(compiled.querySelector('app-site-password-gate h1')?.textContent).toBe('Team Poker');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Team Poker | Real-time planning poker for agile teams',
    );
  });
});
