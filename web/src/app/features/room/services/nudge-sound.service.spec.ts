import { TestBed } from '@angular/core/testing';
import { NUDGE_SOUND_STORAGE_KEY } from '@core/storage/storage-keys';
import {
  NudgeSoundService,
  POLITE_NUDGE_LINE,
  SPICY_NUDGE_ENDING,
  SPICY_NUDGE_LINE,
  nudgeSoundPlan,
} from './nudge-sound.service';

describe('nudgeSoundPlan', () => {
  it('only chimes in Friendly rooms, however many times someone is nudged', () => {
    for (const level of [1, 2, 3] as const) {
      expect(nudgeSoundPlan(level, 'friendly')).toEqual({
        tone: 'chime',
        line: null,
        afterBleep: null,
      });
    }
  });

  it('escalates from a chime to a horn to a yell that matches the mood', () => {
    expect(nudgeSoundPlan(1, 'playful')).toEqual({ tone: 'chime', line: null, afterBleep: null });
    expect(nudgeSoundPlan(2, 'spicy')).toEqual({ tone: 'horn', line: null, afterBleep: null });
    expect(nudgeSoundPlan(3, 'playful')).toEqual({
      tone: 'horn',
      line: POLITE_NUDGE_LINE,
      afterBleep: null,
    });
    expect(nudgeSoundPlan(3, 'spicy')).toEqual({
      tone: 'horn',
      line: SPICY_NUDGE_LINE,
      afterBleep: SPICY_NUDGE_ENDING,
    });
  });
});

describe('nudgeSoundPlan in Graveyard Shift', () => {
  it('caws instead of chiming and sends a flock of crows instead of the horn', () => {
    expect(nudgeSoundPlan(1, 'playful', 'graveyard')).toEqual({
      tone: 'caw',
      line: null,
      afterBleep: null,
    });
    expect(nudgeSoundPlan(3, 'friendly', 'graveyard').tone).toBe('caw');
    expect(nudgeSoundPlan(2, 'playful', 'graveyard').tone).toBe('crows');
    expect(nudgeSoundPlan(3, 'spicy', 'graveyard')).toEqual({
      tone: 'crows',
      line: SPICY_NUDGE_LINE,
      afterBleep: SPICY_NUDGE_ENDING,
    });
  });

  it('keeps the usual tones on every other theme', () => {
    expect(nudgeSoundPlan(1, 'playful', 'vegas').tone).toBe('chime');
    expect(nudgeSoundPlan(2, 'playful', 'vegas').tone).toBe('horn');
  });
});

describe('nudgeSoundPlan in Harvest Table', () => {
  it('rings a dinner bell and then clangs the dinner triangle', () => {
    expect(nudgeSoundPlan(1, 'spicy', 'harvest')).toEqual({
      tone: 'bell',
      line: null,
      afterBleep: null,
    });
    expect(nudgeSoundPlan(3, 'friendly', 'harvest').tone).toBe('bell');
    expect(nudgeSoundPlan(2, 'playful', 'harvest').tone).toBe('triangle');
    expect(nudgeSoundPlan(3, 'playful', 'harvest')).toEqual({
      tone: 'triangle',
      line: POLITE_NUDGE_LINE,
      afterBleep: null,
    });
  });
});

describe('nudgeSoundPlan in Fireside Cabin', () => {
  it('crackles instead of chiming and pops the fire instead of the horn', () => {
    expect(nudgeSoundPlan(1, 'playful', 'cabin')).toEqual({
      tone: 'crackle',
      line: null,
      afterBleep: null,
    });
    expect(nudgeSoundPlan(3, 'friendly', 'cabin').tone).toBe('crackle');
    expect(nudgeSoundPlan(2, 'playful', 'cabin').tone).toBe('pop');
    expect(nudgeSoundPlan(3, 'playful', 'cabin')).toEqual({
      tone: 'pop',
      line: POLITE_NUDGE_LINE,
      afterBleep: null,
    });
  });
});

describe('NudgeSoundService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('defaults to loud, ignores unknown stored values and remembers a choice', () => {
    localStorage.setItem(NUDGE_SOUND_STORAGE_KEY, 'deafening');
    const service = TestBed.inject(NudgeSoundService);
    expect(service.setting()).toBe('loud');
    service.setSetting('quiet');
    expect(service.setting()).toBe('quiet');
    expect(localStorage.getItem(NUDGE_SOUND_STORAGE_KEY)).toBe('quiet');
  });

  it('reads a saved setting and stays quiet where the browser has no audio', () => {
    localStorage.setItem(NUDGE_SOUND_STORAGE_KEY, 'off');
    const service = TestBed.inject(NudgeSoundService);
    expect(service.setting()).toBe('off');
    service.setSetting('loud');
    expect(() => service.play(3, 'spicy')).not.toThrow();
  });

  it('unlocks audio on the first interaction so later nudges can play', () => {
    const resume = vi.fn(() => Promise.resolve());
    class FakeAudioContext {
      state = 'suspended';
      resume = resume;
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      TestBed.inject(NudgeSoundService);
      document.dispatchEvent(new Event('pointerdown'));
      expect(resume).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bleeps the middle of the Spicy yell, then speaks the end of the word', () => {
    vi.useFakeTimers();
    const spoken: { text: string; onend: (() => void) | null }[] = [];
    class FakeUtterance {
      volume = 1;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    const tones: number[] = [];
    const param = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({ gain: param, connect: (next: unknown) => next });
      createOscillator = () => {
        const frequency = {
          set value(hz: number) {
            tones.push(hz);
          },
        };
        return {
          type: 'sine',
          frequency,
          connect: (next: unknown) => next,
          start: vi.fn(),
          stop: vi.fn(),
        };
      };
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{}],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: (utterance: { text: string; onend: (() => void) | null }) => spoken.push(utterance),
    });
    try {
      TestBed.inject(NudgeSoundService).play(3, 'spicy');
      vi.advanceTimersByTime(1100); // past the horn
      expect(spoken.map((utterance) => utterance.text)).toEqual([SPICY_NUDGE_LINE]);
      tones.length = 0;
      spoken[0]?.onend?.();
      expect(tones).toEqual([1000]);
      // The end of the word waits for the bleep, so the two never play together.
      expect(spoken.map((utterance) => utterance.text)).toEqual([SPICY_NUDGE_LINE]);
      vi.advanceTimersByTime(500);
      expect(spoken.map((utterance) => utterance.text)).toEqual([
        SPICY_NUDGE_LINE,
        SPICY_NUDGE_ENDING,
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
  it('still bleeps when the browser never says the first part finished', () => {
    vi.useFakeTimers();
    const spoken: { text: string; onend: (() => void) | null }[] = [];
    class FakeUtterance {
      volume = 1;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    const tones: number[] = [];
    const param = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({ gain: param, connect: (next: unknown) => next });
      createOscillator = () => {
        const frequency = {
          set value(hz: number) {
            tones.push(hz);
          },
        };
        return {
          type: 'sine',
          frequency,
          connect: (next: unknown) => next,
          start: vi.fn(),
          stop: vi.fn(),
        };
      };
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{}],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: (utterance: { text: string; onend: (() => void) | null }) => spoken.push(utterance),
    });
    try {
      TestBed.inject(NudgeSoundService).play(3, 'spicy');
      vi.advanceTimersByTime(1100); // past the horn
      expect(spoken.map((utterance) => utterance.text)).toEqual([SPICY_NUDGE_LINE]);
      tones.length = 0;
      vi.advanceTimersByTime(5000);
      expect(tones).toEqual([1000]);
      expect(spoken.map((utterance) => utterance.text)).toEqual([
        SPICY_NUDGE_LINE,
        SPICY_NUDGE_ENDING,
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
  it('bleeps as soon as the voice goes quiet, before speech reports it ended', () => {
    vi.useFakeTimers();
    const spoken: { text: string; onend: (() => void) | null }[] = [];
    class FakeUtterance {
      volume = 1;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    const tones: number[] = [];
    const param = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({ gain: param, connect: (next: unknown) => next });
      createOscillator = () => {
        const frequency = {
          set value(hz: number) {
            tones.push(hz);
          },
        };
        return {
          type: 'sine',
          frequency,
          connect: (next: unknown) => next,
          start: vi.fn(),
          stop: vi.fn(),
        };
      };
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const speech = { speaking: false };
    vi.stubGlobal('speechSynthesis', {
      get speaking() {
        return speech.speaking;
      },
      getVoices: () => [{}],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak: (utterance: { text: string; onend: (() => void) | null }) => spoken.push(utterance),
    });
    try {
      TestBed.inject(NudgeSoundService).play(3, 'spicy');
      vi.advanceTimersByTime(1100); // past the horn
      expect(spoken.map((utterance) => utterance.text)).toEqual([SPICY_NUDGE_LINE]);
      tones.length = 0;
      speech.speaking = true;
      vi.advanceTimersByTime(100);
      expect(tones).toEqual([]);
      speech.speaking = false;
      vi.advanceTimersByTime(50);
      expect(tones).toEqual([1000]);
      vi.advanceTimersByTime(300);
      expect(spoken.map((utterance) => utterance.text)).toEqual([
        SPICY_NUDGE_LINE,
        SPICY_NUDGE_ENDING,
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
