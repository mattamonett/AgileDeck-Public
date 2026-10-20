import { TestBed } from '@angular/core/testing';
import { Theme } from '@poker/shared';
import { SeasonalThrowablesService } from './seasonal-throwables.service';
import { SocketService } from '@core/socket/socket.service';

describe('SeasonalThrowablesService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          halloweenAvailable: true,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [{ provide: SocketService, useValue: { getApiUrl: () => 'http://api.test' } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('refreshes server availability so an open room loses expired seasonal choices', async () => {
    const service = TestBed.inject(SeasonalThrowablesService);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isAvailable('🎃')).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ halloweenAvailable: false })));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.isAvailable('🎃')).toBe(false);
    expect(service.isAvailable('🧟')).toBe(true);
    TestBed.resetTestingModule();
    const count = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length).toBe(count);
  });

  it('refreshes Thanksgiving independently and expires it while the room stays open', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          halloweenAvailable: false,
          thanksgivingAvailable: true,
        }),
      ),
    );
    const service = TestBed.inject(SeasonalThrowablesService);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isAvailable('🦃')).toBe(true);
    expect(service.isAvailable('🎃')).toBe(false);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          halloweenAvailable: false,
          thanksgivingAvailable: false,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.isAvailable('🦃')).toBe(false);
  });

  it('refreshes Christmas independently and expires it while the room stays open', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          halloweenAvailable: false,
          christmasAvailable: true,
        }),
      ),
    );
    const service = TestBed.inject(SeasonalThrowablesService);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isAvailable('🎅')).toBe(true);
    expect(service.isAvailable('🎃')).toBe(false);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          halloweenAvailable: false,
          christmasAvailable: false,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.isAvailable('🎅')).toBe(false);
  });

  it('offers seasonal themes only while the server lists them', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ seasonalThemes: ['harvest'] })));
    const service = TestBed.inject(SeasonalThrowablesService);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isThemeAvailable(Theme.HARVEST)).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ seasonalThemes: [] })));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.isThemeAvailable(Theme.HARVEST)).toBe(false);
    expect(service.isThemeAvailable(Theme.GRAVEYARD)).toBe(true);
    fetchMock.mockRejectedValue(new Error('offline'));
    service.seasonalThemes.set([Theme.HARVEST]);
    await service.refresh();
    expect(service.isThemeAvailable(Theme.HARVEST)).toBe(false);
  });

  it('fails closed on malformed configuration and network failure', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ halloweenAvailable: 'true' })));
    const service = TestBed.inject(SeasonalThrowablesService);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.isAvailable('🎃')).toBe(false);
    fetchMock.mockRejectedValue(new Error('offline'));
    await service.refresh();
    expect(service.available()).toBe(false);
    expect(service.isAvailable('📄')).toBe(true);
  });
});
