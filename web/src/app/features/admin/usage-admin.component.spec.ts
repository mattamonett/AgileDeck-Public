import { TestBed } from '@angular/core/testing';
import { UsageMetricSchema, type AdminUsageSummary } from '@poker/shared';
import { UsageAdminComponent } from './usage-admin.component';
import { resolveApiUrl } from '@core/api/api-url';

const API = resolveApiUrl();

const summary: AdminUsageSummary = {
  activeDays: 30,
  trackingSince: '2026-10-01',
  rooms: { active: 4, total: 10 },
  settings: [
    { setting: 'autoReveal', active: 3, total: 5 },
    { setting: 'issues', active: 0, total: 0 },
  ],
  themes: [{ theme: 'space', active: 1, total: 2 }],
  moods: [{ mood: 'spicy', active: 2, total: 3 }],
  events: UsageMetricSchema.options.map((metric) => ({
    metric,
    last7Days: metric === 'round.revealed.auto' ? 9 : 0,
    last30Days: metric === 'round.revealed.auto' ? 12 : metric === 'nudge.single' ? 2 : 0,
  })),
  throwables: [{ character: '📄', last30Days: 7 }],
};

describe('UsageAdminComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function create(response: Response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await TestBed.configureTestingModule({ imports: [UsageAdminComponent] }).compileComponents();
    const fixture = TestBed.createComponent(UsageAdminComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture;
  }

  it('shows setting adoption and lists the most used features first', async () => {
    const fixture = await create(new Response(JSON.stringify(summary)));
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('4 of 10 rooms were active in the last 30 days');
    const settings = element.querySelectorAll('table')[0]?.querySelectorAll('tbody tr');
    expect(settings?.[0]?.textContent).toContain('Auto reveal');
    expect(settings?.[0]?.textContent).toContain('3 (75%)');
    expect(settings?.[0]?.textContent).toContain('5 (50%)');
    expect(element.textContent).toContain('Theme: Deep Space');
    const events = element.querySelectorAll('table')[1]?.querySelectorAll('tbody tr');
    expect(events).toHaveLength(UsageMetricSchema.options.length);
    expect(events?.[0]?.textContent).toContain('Rounds revealed automatically');
    expect(events?.[1]?.textContent).toContain('Nudges sent');
    expect(element.querySelector('.throwables')?.textContent).toContain('📄');
    expect(element.textContent).toContain('Counted since 2026-10-01');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(API + '/api/admin/usage');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('reports a server error instead of rendering stale data', async () => {
    const fixture = await create(
      new Response(JSON.stringify({ message: 'Session expired.' }), { status: 403 }),
    );
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Session expired.',
    );
    expect(fixture.componentInstance.summary()).toBeNull();
  });

  it('says usage stats are turned off instead of showing counts', async () => {
    const fixture = await create(new Response(JSON.stringify({ usageStats: 'off' })));
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Usage stats are turned off',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(fixture.componentInstance.summary()).toBeNull();
  });
});
