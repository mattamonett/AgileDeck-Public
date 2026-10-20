import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { NudgeEvent } from '@poker/shared';
import { InteractionService } from '../../services/interaction.service';
import { NudgeSoundService, type NudgeSoundSetting } from '../../services/nudge-sound.service';
import { PokerStore } from '../../state/poker.store';
import { NudgeAlertComponent } from './nudge-alert.component';

describe('NudgeAlertComponent', () => {
  const lastNudge = signal<{ event: NudgeEvent; seq: number } | null>(null);
  const setting = signal<NudgeSoundSetting>('loud');
  const sound = {
    setting,
    play: vi.fn(),
    stop: vi.fn(),
    setSetting: vi.fn((value: NudgeSoundSetting) => setting.set(value)),
  };
  let seq = 0;
  const nudge = (targetUserId: string, level: 1 | 2 | 3 = 1) =>
    lastNudge.set({ event: { targetUserId, sourceUserId: 'pat', level }, seq: ++seq });

  async function setup(waitingOnMe = true) {
    lastNudge.set(null);
    setting.set('loud');
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [NudgeAlertComponent],
      providers: [
        { provide: InteractionService, useValue: { lastNudge } },
        { provide: NudgeSoundService, useValue: sound },
        { provide: PokerStore, useValue: { users: signal([{ id: 'pat', name: 'Pat' }]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(NudgeAlertComponent);
    fixture.componentRef.setInput('currentUserId', 'me');
    fixture.componentRef.setInput('mood', 'spicy');
    fixture.componentRef.setInput('waitingOnMe', waitingOnMe);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    return { fixture, root };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    document.title = '';
  });

  it('alerts only the nudged player, naming who nudged them, in the room mood', async () => {
    const { fixture, root } = await setup();
    nudge('someone-else');
    fixture.detectChanges();
    expect(root.querySelector('.nudge-alert')).toBeNull();
    expect(sound.play).not.toHaveBeenCalled();

    nudge('me', 3);
    fixture.detectChanges();
    expect(root.querySelector('.nudge-alert.level-3')?.textContent).toContain('Pat nudged you');
    expect(root.querySelector('strong')?.textContent).toBe('VOTE!');
    expect(sound.play).toHaveBeenCalledWith(3, 'spicy');
  });

  it('ignores a nudge that arrives after the player has voted', async () => {
    const { fixture, root } = await setup(false);
    nudge('me');
    fixture.detectChanges();
    expect(root.querySelector('.nudge-alert')).toBeNull();
    expect(sound.play).not.toHaveBeenCalled();
  });

  it('flashes the tab title until the player votes, then restores it', async () => {
    vi.useFakeTimers();
    document.title = 'Agile Deck';
    const { fixture, root } = await setup();
    nudge('me');
    fixture.detectChanges();
    vi.advanceTimersByTime(1_000);
    expect(document.title).toBe('🔔 Your vote');
    vi.advanceTimersByTime(1_000);
    expect(document.title).toBe('Agile Deck');
    vi.advanceTimersByTime(1_000);

    fixture.componentRef.setInput('waitingOnMe', false);
    fixture.detectChanges();
    expect(root.querySelector('.nudge-alert')).toBeNull();
    expect(document.title).toBe('Agile Deck');
    expect(sound.stop).toHaveBeenCalled();
  });

  it('lets the player mute nudge sounds or dismiss the alert', async () => {
    const { fixture, root } = await setup();
    nudge('me');
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.nudge-mute')?.click();
    fixture.detectChanges();
    expect(sound.setSetting).toHaveBeenCalledWith('off');
    expect(root.querySelector('.nudge-mute')).toBeNull();

    root.querySelector<HTMLButtonElement>('.nudge-close')?.click();
    fixture.detectChanges();
    expect(root.querySelector('.nudge-alert')).toBeNull();
  });
});
