import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import { LegalPageComponent } from './legal-page.component';

async function render(page: unknown, configure?: (config: SiteConfigService) => void) {
  await TestBed.configureTestingModule({
    imports: [LegalPageComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } },
    ],
  }).compileComponents();
  configure?.(TestBed.inject(SiteConfigService));
  const fixture = TestBed.createComponent(LegalPageComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function headings(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll('h3'), (heading) => heading.textContent.trim());
}

describe('LegalPageComponent', () => {
  it('shows every privacy notice section', async () => {
    const element = await render('privacy');
    expect(element.querySelector('h1')?.textContent).toBe('Privacy notice');
    expect(headings(element)).toEqual(
      FALLBACK_SITE_CONFIG.legal.privacy.map((section) => section.heading),
    );
  });

  it('shows the full site use agreement', async () => {
    const element = await render('terms');
    expect(element.querySelector('h1')?.textContent).toBe('Site use agreement');
    expect(headings(element)).toEqual(
      FALLBACK_SITE_CONFIG.legal.terms.map((section) => section.heading),
    );
  });

  it('falls back to the agreement for unknown route data', async () => {
    const element = await render('other');
    expect(element.querySelector('h1')?.textContent).toBe('Site use agreement');
  });

  it("shows the operator's text, name and date as plain text", async () => {
    const element = await render('privacy', (config) =>
      config.set({
        ...FALLBACK_SITE_CONFIG,
        site: { ...FALLBACK_SITE_CONFIG.site, name: 'Team Poker' },
        legal: {
          ...FALLBACK_SITE_CONFIG.legal,
          privacyUpdated: '1 May 2027',
          privacy: [
            { heading: '', paragraphs: ['<b>Intro</b>'] },
            { heading: 'Data', paragraphs: ['Line one\nLine two'] },
          ],
        },
      }),
    );
    expect(element.querySelector('.back-link')?.textContent).toContain('Back to Team Poker');
    expect(element.querySelector('.updated')?.textContent).toBe('Last updated 1 May 2027');
    expect(headings(element)).toEqual(['Data']);
    expect(element.querySelector('b')).toBeNull();
    const paragraphs = Array.from(
      element.querySelectorAll('.legal-section p'),
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual(['<b>Intro</b>', 'Line one\nLine two']);
  });
});
