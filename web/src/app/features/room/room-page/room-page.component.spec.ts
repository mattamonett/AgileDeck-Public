import { SocketService } from '@core/socket/socket.service';
import { IssueStatus, Theme } from '@poker/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomPageComponent } from './room-page.component';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  PROJECTILE_STORAGE_KEY,
  SITE_AGREEMENT_STORAGE_KEY,
  USER_NAME_STORAGE_KEY,
} from '@core/storage/storage-keys';
import { By } from '@angular/platform-browser';
import { IssuesPanelComponent } from '../issues/issues-panel.component';
import { PokerTableComponent } from '../table/poker-table/poker-table.component';
import { InteractionService } from '../services/interaction.service';
import { SeasonalThrowablesService } from '../services/seasonal-throwables.service';
import { PokerStore } from '../state/poker.store';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';
import type { PublicSiteConfig } from '@poker/shared';

const FEEDBACK_AGREEMENT_VERSION = FALLBACK_SITE_CONFIG.legal.agreementVersion;

function withContent(content: Partial<PublicSiteConfig['content']>): PublicSiteConfig {
  return { ...FALLBACK_SITE_CONFIG, content: { ...FALLBACK_SITE_CONFIG.content, ...content } };
}

describe('RoomPageComponent', () => {
  let component: RoomPageComponent;
  let fixture: ComponentFixture<RoomPageComponent>;

  beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              issues: [
                {
                  id: 'issue-1',
                  title: 'Keep this issue',
                  status: IssueStatus.OPEN,
                  estimate: null,
                  createdAt: '2026-09-21T00:00:00.000Z',
                },
              ],
              activeIssue: null,
              nextCursor: null,
            }),
          ),
      ),
    );
    await TestBed.configureTestingModule({
      imports: [RoomPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: SocketService,
          useValue: {
            getSocket: () => ({ connected: true, on: vi.fn(), off: vi.fn() }),
            getApiUrl: () => 'http://api.test',
            leaveRoom: vi.fn(),
            isInRoom: vi.fn().mockReturnValue(false),
            joinRoom: vi.fn(),
            setSelectedProjectile: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(PokerTableComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(RoomPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('hides expired seasonal options and falls back from an equipped Halloween character', () => {
    TestBed.inject(SeasonalThrowablesService).available.set(true);
    component.selectProjectile('🎃');
    expect(component.selectedProjectile()).toBe('🎃');
    expect(component.allEmojisWithTags().some(({ char }) => char === '🎃')).toBe(true);
    TestBed.inject(SeasonalThrowablesService).available.set(false);
    expect(component.selectedProjectile()).toBe('📄');
    expect(component.allEmojisWithTags().some(({ char }) => char === '🎃')).toBe(false);
    component.selectProjectile('🧛');
    expect(component.selectedProjectile()).toBe('📄');
  });

  it('falls back when a Thanksgiving selection expires', () => {
    TestBed.inject(SeasonalThrowablesService).thanksgivingAvailable.set(true);
    component.selectProjectile('🦃');
    expect(component.selectedProjectile()).toBe('🦃');
    TestBed.inject(SeasonalThrowablesService).thanksgivingAvailable.set(false);
    expect(component.selectedProjectile()).toBe('📄');
    expect(component.allEmojisWithTags().some(({ char }) => char === '🦃')).toBe(false);
  });

  it('falls back when a Christmas selection expires', () => {
    TestBed.inject(SeasonalThrowablesService).christmasAvailable.set(true);
    component.selectProjectile('🎅');
    expect(component.selectedProjectile()).toBe('🎅');
    TestBed.inject(SeasonalThrowablesService).christmasAvailable.set(false);
    expect(component.selectedProjectile()).toBe('📄');
    expect(component.allEmojisWithTags().some(({ char }) => char === '🎅')).toBe(false);
  });

  it('does not leave the room when the board component is destroyed', () => {
    fixture.destroy();
    expect(TestBed.inject(SocketService).leaveRoom).not.toHaveBeenCalled();
  });

  it('resumes an existing room without joining again', async () => {
    history.replaceState({}, '');
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Tester');
    localStorage.setItem(SITE_AGREEMENT_STORAGE_KEY, FEEDBACK_AGREEMENT_VERSION);
    vi.mocked(TestBed.inject(SocketService).isInRoom).mockReturnValue(true);
    vi.spyOn(TestBed.inject(ActivatedRoute), 'paramMap', 'get').mockReturnValue(
      of(convertToParamMap({ id: 'test-room' })),
    );
    await component.ngOnInit();
    expect(component.roomId()).toBe('test-room');
    expect(TestBed.inject(SocketService).isInRoom).toHaveBeenCalledWith('test-room');
    expect(TestBed.inject(SocketService).joinRoom).not.toHaveBeenCalled();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides issues and the active title without discarding the backlog', async () => {
    const room = {
      id: 'test-room',
      name: 'Test room',
      reveal: false,
      autoReveal: false,
      useMultiplier: false,
      multiplierValue: 1,
      theme: 'default',
      lobbyEnabled: false,
      issuesEnabled: true,
      mood: 'playful' as const,
      roundClock: null,
    };
    TestBed.inject(PokerStore).setCurrentRoom(room);
    TestBed.inject(PokerStore).setCurrentUser({
      id: 'test-user',
      name: 'Tester',
      isApproved: true,
      isObserver: false,
    });
    fixture.detectChanges();
    const panel: IssuesPanelComponent = fixture.debugElement.query(
      By.directive(IssuesPanelComponent),
    ).componentInstance;
    await panel.store.refresh();
    await fixture.whenStable();
    expect(panel.issues().at(-1)?.title).toBe('Keep this issue');
    const root: HTMLElement = fixture.nativeElement;
    TestBed.inject(PokerStore).setCurrentRoom({ ...room, issuesEnabled: false });
    fixture.detectChanges();
    expect(root.querySelector('app-issues-panel')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.active-issue')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.session-layout')?.classList.contains('issues-disabled')).toBe(true);
    TestBed.inject(PokerStore).setCurrentRoom(room);
    fixture.detectChanges();
    expect(root.querySelector('app-issues-panel')?.hasAttribute('hidden')).toBe(false);
    expect(panel.issues().at(-1)?.title).toBe('Keep this issue');
  });

  it('persists and restores the selected projectile', () => {
    component.selectProjectile('📄');

    expect(localStorage.getItem(PROJECTILE_STORAGE_KEY)).toBe('📄');

    const restoredFixture = TestBed.createComponent(RoomPageComponent);
    expect(restoredFixture.componentInstance.selectedProjectile()).toBe('📄');
  });

  it('hides rough throwables and falls back to paper while the room is Friendly', () => {
    localStorage.setItem(PROJECTILE_STORAGE_KEY, '💩');
    const roomFixture = TestBed.createComponent(RoomPageComponent);
    const room = roomFixture.componentInstance;
    const base = {
      id: 'test-room',
      name: 'Test room',
      reveal: false,
      autoReveal: false,
      useMultiplier: false,
      multiplierValue: 1,
      theme: 'default',
      lobbyEnabled: false,
      issuesEnabled: true,
      mood: 'playful' as const,
      roundClock: null,
    };
    TestBed.inject(PokerStore).setCurrentRoom(base);
    expect(room.selectedProjectile()).toBe('💩');
    expect(room.allEmojisWithTags().some(({ char }) => char === '💩')).toBe(true);
    expect(room.topProjectiles()).toContain('🐒');

    TestBed.inject(PokerStore).setCurrentRoom({ ...base, mood: 'friendly' });
    expect(room.selectedProjectile()).toBe('📄');
    expect(room.allEmojisWithTags().some(({ char }) => char === '💩')).toBe(false);
    expect(room.allEmojisWithTags().some(({ char }) => char === '🍅')).toBe(true);
    expect(room.topProjectiles()).not.toContain('🐒');
    localStorage.removeItem(PROJECTILE_STORAGE_KEY);
  });

  describe('with features turned off by the site', () => {
    const room = {
      id: 'test-room',
      name: 'Test room',
      reveal: false,
      autoReveal: false,
      useMultiplier: false,
      multiplierValue: 1,
      theme: 'default',
      lobbyEnabled: false,
      issuesEnabled: true,
      mood: 'playful' as const,
      roundClock: null,
    };

    function turnOff(features: { feedback?: boolean; issues?: boolean }) {
      TestBed.inject(SiteConfigService).set({
        ...FALLBACK_SITE_CONFIG,
        features: { ...FALLBACK_SITE_CONFIG.features, ...features },
      });
      vi.mocked(fetch).mockClear();
      TestBed.inject(PokerStore).setCurrentRoom(room);
      TestBed.inject(PokerStore).setCurrentUser({
        id: 'test-user',
        name: 'Tester',
        isApproved: true,
        isObserver: false,
      });
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('hides the feedback button and never asks for feedback news', async () => {
      const root = turnOff({ feedback: false });
      await fixture.whenStable();
      expect(root.querySelector('.feedback-toggle')).toBeNull();
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/feedback')),
      ).toBe(false);
    });

    it('hides the issue panels and never asks for issues', async () => {
      const root = turnOff({ issues: false });
      await fixture.whenStable();
      expect(root.querySelector('app-issues-panel')?.hasAttribute('hidden')).toBe(true);
      expect(root.querySelector('.active-issue')?.hasAttribute('hidden')).toBe(true);
      expect(root.querySelector('.session-layout')?.classList.contains('issues-disabled')).toBe(
        true,
      );
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/issues'))).toBe(
        false,
      );
    });
  });

  it('skips throwables the operator blocked and replaces a saved one that is now blocked', () => {
    TestBed.inject(SiteConfigService).set(withContent({ blockedThrowables: ['💩', '📄', '🐶'] }));
    localStorage.setItem(PROJECTILE_STORAGE_KEY, '💩');
    const room = TestBed.createComponent(RoomPageComponent).componentInstance;

    expect(room.selectedProjectile()).toBe('👽');
    expect(room.topProjectiles()).not.toContain('🐶');
    expect(room.allEmojisWithTags().some(({ char }) => char === '💩')).toBe(false);
    room.selectProjectile('📄');
    expect(localStorage.getItem(PROJECTILE_STORAGE_KEY)).toBe('💩');
  });

  it('turns every throw control off when the operator disables throwing', () => {
    TestBed.inject(SiteConfigService).set(withContent({ throwables: false }));
    const roomFixture = TestBed.createComponent(RoomPageComponent);
    const room = roomFixture.componentInstance;
    const throwProjectile = vi.spyOn(TestBed.inject(InteractionService), 'throwProjectile');

    expect(room.selectedProjectile()).toBeNull();
    expect(room.throwingEnabled()).toBe(false);
    expect(room.topProjectiles()).toEqual([]);
    room.openEmojiPicker();
    expect(room.showEmojiPicker()).toBe(false);
    room.throwEquipped('user-2');
    expect(throwProjectile).not.toHaveBeenCalled();
  });

  it("offers only the operator's themes and uses its default mood before a room loads", () => {
    TestBed.inject(SiteConfigService).set(
      withContent({
        moods: ['friendly', 'spicy'],
        defaultMood: 'friendly',
        themes: [Theme.SPACE, Theme.VEGAS],
        defaultTheme: Theme.SPACE,
      }),
    );
    const room = TestBed.createComponent(RoomPageComponent).componentInstance;

    expect(room.themes().map((theme) => theme.id)).toEqual([Theme.SPACE, Theme.VEGAS]);
    expect(room.roomMood()).toBe('friendly');
  });
});
