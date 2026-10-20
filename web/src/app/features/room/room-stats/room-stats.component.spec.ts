import { signal } from '@angular/core';
import { PokerStore } from '../state/poker.store';
import { SocketService } from '@core/socket/socket.service';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RoomStatsComponent } from './room-stats.component';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import type { RoomStats } from '@poker/shared';

const counts = {
  votesCast: 4,
  throwsSent: 2,
  throwsReceived: 2,
  barragesSent: 1,
};
const data: RoomStats = {
  roomName: 'Garden team',
  startedAt: '2026-10-01T00:00:00.000Z',
  roundsRevealed: 2,
  awardsStartedAt: '2026-10-02T00:00:00.000Z',
  unanimousRounds: 1,
  awards: {
    onARoll: { score: 2, winnerCount: 1, winners: [{ id: 'opaque-id', name: 'Sam', isYou: true }] },
    varietyShow: null,
  },
  issueStats: {
    estimated: 1,
    spiciest: {
      id: 'issue',
      title: 'Checkout',
      firstMin: 2,
      firstMax: 13,
      latestMin: 5,
      latestMax: 5,
      tiedCount: 1,
    },
    commonGround: null,
  },
  totals: counts,
  participants: 26,
  page: 1,
  pageSize: 25,
  members: [
    {
      id: 'opaque-id',
      name: 'Sam',
      isYou: true,
      rank: 1,
      bestVoteStreak: 2,
      characterVariety: 1,
      ...counts,
    },
  ],
};

describe('RoomStatsComponent', () => {
  const currentRoom = signal<{ id: string; issuesEnabled: boolean } | null>(null);
  const isConnected = signal(false);
  beforeEach(() => {
    currentRoom.set(null);
    isConnected.set(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(JSON.stringify(data))),
    );
    TestBed.configureTestingModule({
      imports: [RoomStatsComponent],
      providers: [
        provideRouter([]),
        { provide: PokerStore, useValue: { currentRoom, isConnected } },
        { provide: SocketService, useValue: { isInRoom: () => true } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'team' })) } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('renders room totals, member contributions, own identity and pagination', async () => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Garden team stats');
    expect(fixture.nativeElement.textContent).toContain('Sam');
    expect(fixture.nativeElement.textContent).toContain('You');
    expect(fixture.componentInstance.pages()).toBe(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/rooms/team/stats?page=1&sort=votesCast'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('resets pagination when choosing a leaderboard category', async () => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    fixture.componentInstance.page.set(2);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(data)));
    fixture.componentInstance.chooseMetric('throwsSent');
    await fixture.whenStable();
    expect(fixture.componentInstance.page()).toBe(1);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('page=1&sort=throwsSent'),
      expect.anything(),
    );
  });

  it.each([
    ['votesCast', 'Votes cast', '4'],
    ['throwsSent', 'Throws sent', '2'],
    ['throwsReceived', 'Throws received', '2'],
    ['barragesSent', 'Barrages sent', '1'],
    ['bestVoteStreak', 'Vote streak', '2'],
    ['characterVariety', 'Character variety', '1'],
  ])('shows and sorts the %s category', async (_metric, label, value) => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const button = [...root.querySelectorAll<HTMLButtonElement>('.categories button')].find(
      (element) => element.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.categories [aria-pressed="true"]')?.textContent?.trim()).toBe(
      label,
    );
    expect(root.querySelector('thead .score')?.textContent).toBe(label);
    expect(root.querySelector('tbody .score')?.textContent?.trim()).toBe(value);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining(`sort=${_metric}`),
      expect.anything(),
    );
  });

  it('hides issue totals and highlights when disabled, keeping awards and all original metrics', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...data, issueStats: null })));
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).not.toContain('Issues estimated');
    expect(root.querySelector('.issue-highlights')).toBeNull();
    expect(root.querySelectorAll('.totals article')).toHaveLength(5);
    expect(root.querySelectorAll('.categories button')).toHaveLength(6);
    expect(root.textContent).toContain('On a Roll');
    expect(root.textContent).toContain('Perfect Harmony');
  });

  it('leaves out throw metrics and awards when the site turns throwing off', async () => {
    TestBed.inject(SiteConfigService).set({
      ...FALLBACK_SITE_CONFIG,
      content: { ...FALLBACK_SITE_CONFIG.content, throwables: false },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...data, issueStats: null })));
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const categories = Array.from(root.querySelectorAll('.categories button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(categories).toEqual(['Votes cast', 'Vote streak']);
    expect(root.querySelectorAll('.totals article')).toHaveLength(2);
    expect(root.textContent).toContain('On a Roll');
    expect(root.textContent).not.toContain('Variety Show');
    expect(root.textContent).not.toContain('barrage');
  });

  it('reacts to room settings without losing issue history and only claims presence when connected', async () => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.presence')).toBeNull();
    expect(root.textContent).toContain('Checkout');
    currentRoom.set({ id: 'team', issuesEnabled: false });
    isConnected.set(true);
    fixture.detectChanges();
    expect(root.querySelector('.presence')?.textContent).toContain('Still at the table');
    expect(root.querySelector('.issue-highlights')).toBeNull();
    currentRoom.set({ id: 'team', issuesEnabled: true });
    isConnected.set(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('Checkout');
    expect(root.querySelector('.presence')).toBeNull();
  });

  it('shows empty and shared awards without claiming a zero-score winner', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ...data,
          awards: {
            varietyShow: null,
            onARoll: {
              score: 12,
              winnerCount: 4,
              winners: [
                { id: 'a', name: 'Alex', isYou: false },
                { id: 'b', name: 'Sam', isYou: true },
                { id: 'c', name: 'Priya', isYou: false },
              ],
            },
          },
        }),
      ),
    );
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Shared award');
    expect(fixture.nativeElement.textContent).toContain('+1 tied');
    expect(fixture.nativeElement.textContent).toContain('Up for grabs');
  });

  it('keeps the current table and focused category mounted while a new ranking loads', async () => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Response promise is not ready');
    };
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.mocked(fetch).mockReturnValue(pending);
    const load = vi.spyOn(fixture.componentInstance, 'load');
    const button = [...root.querySelectorAll<HTMLButtonElement>('.categories button')].find(
      (element) => element.textContent?.trim() === 'Vote streak',
    );
    button?.focus();
    button?.click();
    fixture.detectChanges();
    expect(root.contains(button ?? null)).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(root.querySelector('thead .score')?.textContent).toContain('Votes cast');
    expect(root.textContent).not.toContain('Loading room stats');
    expect(button?.classList.contains('busy')).toBe(true);
    expect(root.querySelectorAll('button.busy')).toHaveLength(1);
    resolveResponse(new Response(JSON.stringify(data)));
    expect(load).toHaveBeenCalledOnce();
    await load.mock.results[0]?.value;
    await fixture.whenStable();
    expect(root.querySelector('thead .score')?.textContent).toContain('Vote streak');
    expect(document.activeElement).toBe(button);
    fixture.detectChanges();
    expect(root.querySelector('button.busy')).toBeNull();
  });

  it('spins only the refresh button while refreshing loaded stats', async () => {
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => undefined));
    const refresh = root.querySelector<HTMLButtonElement>('.page-heading button');
    refresh?.click();
    fixture.detectChanges();
    expect(refresh?.classList.contains('busy')).toBe(true);
    expect(root.querySelectorAll('button.busy')).toHaveLength(1);
    expect(root.textContent).not.toContain('Loading room stats');
    expect(root.querySelector('table')).not.toBeNull();
  });

  it('shows the loading message before the first stats arrive', () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => undefined));
    const fixture = TestBed.createComponent(RoomStatsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading room stats');
    expect(fixture.nativeElement.querySelector('button.busy')).toBeNull();
  });

  it('shows an access message without exposing a stale leaderboard', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 403 }));
    const fixture = TestBed.createComponent(RoomStatsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('get approved');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });
});
