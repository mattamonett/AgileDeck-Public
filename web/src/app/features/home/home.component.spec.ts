import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeComponent } from './home.component';
import { SITE_AGREEMENT_STORAGE_KEY, USER_NAME_STORAGE_KEY } from '@core/storage/storage-keys';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import { SiteAccessService } from '@core/access/site-access.service';
import { Router } from '@angular/router';
import type { PublicSiteConfig } from '@poker/shared';

const FEEDBACK_AGREEMENT_VERSION = FALLBACK_SITE_CONFIG.legal.agreementVersion;

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    localStorage.removeItem(SITE_AGREEMENT_STORAGE_KEY);
    localStorage.removeItem(USER_NAME_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    localStorage.removeItem(SITE_AGREEMENT_STORAGE_KEY);
    localStorage.removeItem(USER_NAME_STORAGE_KEY);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires explicit agreement before completing onboarding', () => {
    component.name = 'Alice';
    component.submitName();
    expect(component.hasName()).toBe(false);
    expect(localStorage.getItem(USER_NAME_STORAGE_KEY)).toBeNull();

    component.agreementAccepted.set(true);
    component.submitName();
    expect(component.hasName()).toBe(true);
    expect(localStorage.getItem(SITE_AGREEMENT_STORAGE_KEY)).toBe(FEEDBACK_AGREEMENT_VERSION);
  });

  it('shows onboarding again when the saved name has no current agreement', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Alice');
    const next = TestBed.createComponent(HomeComponent);
    expect(next.componentInstance.hasName()).toBe(false);
    expect(next.componentInstance.name).toBe('Alice');
  });

  function withConfig(change: (config: PublicSiteConfig) => PublicSiteConfig): HomeComponent {
    TestBed.inject(SiteConfigService).set(change(FALLBACK_SITE_CONFIG));
    const next = TestBed.createComponent(HomeComponent);
    next.detectChanges();
    fixture = next;
    return next.componentInstance;
  }

  it('shows the site name from the settings', () => {
    withConfig((config) => ({ ...config, site: { ...config.site, name: 'Team Poker' } }));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Team Poker');
  });

  it('asks for no agreement when the site requires none', () => {
    const home = withConfig((config) => ({
      ...config,
      legal: { ...config.legal, requireAgreement: false },
    }));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#site-agreement-accepted')).toBeNull();
    expect(element.querySelector('app-site-agreement')).toBeNull();
    home.name = 'Alice';
    home.submitName();
    expect(home.hasName()).toBe(true);
    expect(localStorage.getItem(SITE_AGREEMENT_STORAGE_KEY)).toBeNull();
  });

  it('asks for the site password before creating a room when it protects room creation', async () => {
    const home = withConfig((config) => ({
      ...config,
      access: { passwordProtects: 'room-creation' },
    }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    home.name = 'Alice';
    home.agreementAccepted.set(true);
    home.submitName();
    home.createRoom();
    expect(navigate).not.toHaveBeenCalled();
    expect(home.askingPassword()).toBe(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#site-password')).not.toBeNull();

    const access = TestBed.inject(SiteAccessService);
    const unlock = vi.spyOn(access, 'unlock').mockResolvedValue({ ok: true });
    vi.spyOn(access, 'unlocked').mockReturnValue(true);
    home.passwordAccepted();
    expect(home.askingPassword()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/room', expect.any(String)], {
      state: { create: true },
    });
    expect(unlock).not.toHaveBeenCalled();
  });
});
