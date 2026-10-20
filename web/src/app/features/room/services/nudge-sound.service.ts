import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Theme, type NudgeLevel, type RoomMood } from '@poker/shared';
import { readLocalPreference, writeLocalPreference } from '@core/storage/local-preference';
import { NUDGE_SOUND_STORAGE_KEY } from '@core/storage/storage-keys';

export type NudgeSoundSetting = 'loud' | 'quiet' | 'off';
export const NUDGE_SOUND_SETTINGS: readonly { value: NudgeSoundSetting; label: string }[] = [
  { value: 'loud', label: 'Loud' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'off', label: 'Off' },
];

export type NudgeTone =
  'chime' | 'horn' | 'caw' | 'crows' | 'bell' | 'triangle' | 'crackle' | 'pop';

export interface NudgeSoundPlan {
  readonly tone: NudgeTone;
  /** Spoken after the tone, or null for no voice. */
  readonly line: string | null;
  /** When set, a censor bleep follows the line and then this is spoken, like a radio edit. */
  readonly afterBleep: string | null;
}

export const POLITE_NUDGE_LINE = "We're all waiting on your vote!";
// Spoken as "Vote, mother fuh (BEEP) er", so the bleep lands in the middle of the word.
export const SPICY_NUDGE_LINE = 'Vote, mother fuh';
export const SPICY_NUDGE_ENDING = 'er';

interface ThemeTones {
  readonly gentle: NudgeTone;
  readonly loud: NudgeTone;
}

const DEFAULT_TONES: ThemeTones = { gentle: 'chime', loud: 'horn' };

/**
 * Themes with their own nudge sounds. Graveyard Shift caws like a crow and then
 * a flock of them; Harvest Table rings a dinner bell and then clangs the triangle;
 * Fireside Cabin crackles like a burning log and then pops loudly.
 */
const THEME_TONES: ReadonlyMap<string, ThemeTones> = new Map([
  [Theme.GRAVEYARD, { gentle: 'caw', loud: 'crows' }],
  [Theme.HARVEST, { gentle: 'bell', loud: 'triangle' }],
  [Theme.CABIN, { gentle: 'crackle', loud: 'pop' }],
]);

/** Friendly rooms only ever play the gentle tone; the other moods escalate to the loud one and then a yell. */
export function nudgeSoundPlan(
  level: NudgeLevel,
  mood: RoomMood,
  theme: string = Theme.GARDEN,
): NudgeSoundPlan {
  const { gentle, loud } = THEME_TONES.get(theme) ?? DEFAULT_TONES;
  if (mood === 'friendly' || level === 1) return { tone: gentle, line: null, afterBleep: null };
  if (level === 2) return { tone: loud, line: null, afterBleep: null };
  return mood === 'spicy'
    ? { tone: loud, line: SPICY_NUDGE_LINE, afterBleep: SPICY_NUDGE_ENDING }
    : { tone: loud, line: POLITE_NUDGE_LINE, afterBleep: null };
}

const RADIO_BLEEP_SECONDS = 0.35;
/** The end of the word is queued this long before the bleep stops, to cover the engine's start-up lag. */
const ENDING_LEAD_SECONDS = 0.1;
const SPEECH_POLL_MS = 40;

/** A generous length for a short spoken line, for when the browser never says speech ended. */
function spokenSeconds(line: string): number {
  return 0.5 + line.length * 0.07;
}

const VOLUME: Record<Exclude<NudgeSoundSetting, 'off'>, number> = { loud: 1, quiet: 0.3 };

function isNudgeSoundSetting(value: unknown): value is NudgeSoundSetting {
  return value === 'loud' || value === 'quiet' || value === 'off';
}

@Injectable({ providedIn: 'root' })
export class NudgeSoundService {
  readonly setting = signal<NudgeSoundSetting>(this.readSetting());
  /** False when the browser has no speech voice, so the yell at level 3 stays silent. */
  readonly hasVoice = signal(true);
  private context: AudioContext | null = null;
  private speaking: SpeechSynthesisUtterance | null = null;

  constructor() {
    // Browsers only let a page start audio after the person interacts with it, and a
    // nudge arrives from the network, never from a click. Unlocking audio on the first
    // interaction means later nudges can play even though nobody clicks at that moment.
    const unlock = () => {
      const context = this.audioContext();
      if (!context) return stop();
      void context.resume().then(() => {
        if (context.state === 'running') stop();
      });
    };
    const stop = () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
    }
    const updateVoices = () => this.hasVoice.set(speechSynthesis.getVoices().length > 0);
    if (typeof speechSynthesis !== 'undefined') {
      updateVoices();
      speechSynthesis.addEventListener('voiceschanged', updateVoices);
    }
    inject(DestroyRef).onDestroy(() => {
      stop();
      if (typeof speechSynthesis !== 'undefined')
        speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    });
  }

  setSetting(value: NudgeSoundSetting): void {
    this.setting.set(value);
    if (value === 'off') this.stop();
    writeLocalPreference(NUDGE_SOUND_STORAGE_KEY, value);
  }

  play(level: NudgeLevel, mood: RoomMood, theme?: string): void {
    const setting = this.setting();
    if (setting === 'off') return;
    this.playAt(level, mood, theme, VOLUME[setting]);
  }

  /** Plays the loudest nudge for this room so the person can check what they will hear. */
  test(mood: RoomMood, theme?: string): void {
    const setting = this.setting();
    this.playAt(3, mood, theme, VOLUME[setting === 'off' ? 'quiet' : setting]);
  }

  private playAt(
    level: NudgeLevel,
    mood: RoomMood,
    theme: string | undefined,
    volume: number,
  ): void {
    const plan = nudgeSoundPlan(level, mood, theme);
    const context = this.audioContext();
    // Browsers keep audio suspended until the person has interacted with the page;
    // in that case the visual nudge and tab title still reach them.
    if (context) {
      void context.resume().catch(() => undefined);
      const toneEnd = this.tone(context, plan.tone, volume);
      if (plan.line) this.speak(plan.line, volume, plan.afterBleep, toneEnd);
    } else if (plan.line) {
      this.speak(plan.line, volume, plan.afterBleep, 0);
    }
  }

  stop(): void {
    this.speaking = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private readSetting(): NudgeSoundSetting {
    const stored = readLocalPreference(NUDGE_SOUND_STORAGE_KEY);
    return isNudgeSoundSetting(stored) ? stored : 'loud';
  }

  private audioContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') return null;
    this.context = new AudioContext();
    return this.context;
  }

  /** Plays a nudge tone and returns its length in seconds. */
  private tone(context: AudioContext, tone: NudgeSoundPlan['tone'], volume: number): number {
    switch (tone) {
      case 'chime':
        return this.chime(context, volume);
      case 'horn':
        return this.horn(context, volume);
      case 'caw':
        return this.caws(context, volume, [0]);
      case 'crows':
        return this.caws(context, volume, [0, 0.32, 0.7, 0.95]);
      case 'bell':
        return this.bell(context, volume, [0]);
      case 'triangle':
        return this.bell(context, volume, [0, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66], 2.3);
      case 'crackle':
        return this.crackles(context, volume, [0, 0.09, 0.15, 0.31, 0.38, 0.56]);
      case 'pop':
        return this.firePop(context, volume);
    }
  }

  /**
   * Plays a short snap of filtered noise at each offset and returns their length in
   * seconds. Uneven gaps and alternating brightness make it sound like a burning log.
   */
  private crackles(context: AudioContext, volume: number, offsets: readonly number[]): number {
    const start = context.currentTime;
    const length = 0.05;
    const noise = this.noise(context, length);
    offsets.forEach((offset, index) => {
      const at = start + offset;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noise;
      filter.type = 'highpass';
      filter.frequency.value = index % 2 === 0 ? 1800 : 2600;
      gain.gain.setValueAtTime(Math.max((index % 3 === 0 ? 0.7 : 0.45) * volume, 0.0002), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(at);
      source.stop(at + length);
    });
    return (offsets.at(-1) ?? 0) + length;
  }

  /** Plays a deep thump from the fire, then a shower of sparks, and returns its length in seconds. */
  private firePop(context: AudioContext, volume: number): number {
    const start = context.currentTime;
    const thump = context.createOscillator();
    const gain = context.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, start);
    thump.frequency.exponentialRampToValueAtTime(45, start + 0.25);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.8 * volume, 0.0002), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    thump.connect(gain).connect(context.destination);
    thump.start(start);
    thump.stop(start + 0.35);
    this.crackles(context, volume, [0.02, 0.06, 0.13, 0.2, 0.24, 0.35, 0.41, 0.58, 0.66, 0.85]);
    return 0.9;
  }

  private noise(context: AudioContext, length: number): AudioBuffer {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * length),
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Strikes a small brass bell at each offset and returns their length in seconds.
   * Inharmonic overtones over the fundamental give it the ring of struck metal, and a
   * higher pitch with quick repeats turns it into a dinner triangle being rung.
   */
  private bell(
    context: AudioContext,
    volume: number,
    offsets: readonly number[],
    pitch = 1,
  ): number {
    const start = context.currentTime;
    const ring = offsets.length > 1 ? 0.5 : 1.2;
    for (const offset of offsets) {
      [1, 2.76, 5.4].forEach((overtone, index) => {
        const length = ring / (index + 1);
        const peak = (0.3 / (index + 1)) * volume;
        this.note(context, 'sine', 740 * pitch * overtone, start + offset, length, peak);
      });
    }
    return (offsets.at(-1) ?? 0) + ring;
  }

  /**
   * Plays a harsh caw at each offset and returns their length in seconds. A falling
   * sawtooth, roughened by a fast wobble and narrowed by a band-pass, reads as a crow.
   */
  private caws(context: AudioContext, volume: number, offsets: readonly number[]): number {
    const start = context.currentTime;
    const length = 0.28;
    offsets.forEach((offset, index) => {
      const at = start + offset;
      const pitch = index % 2 === 0 ? 1 : 0.88;
      const oscillator = context.createOscillator();
      const wobble = context.createOscillator();
      const wobbleDepth = context.createGain();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(820 * pitch, at);
      oscillator.frequency.exponentialRampToValueAtTime(520 * pitch, at + length);
      wobble.frequency.value = 55;
      wobbleDepth.gain.value = 90;
      wobble.connect(wobbleDepth).connect(oscillator.frequency);
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 2.5;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.5 * volume, 0.0002), at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      oscillator.connect(filter).connect(gain).connect(context.destination);
      for (const node of [oscillator, wobble]) {
        node.start(at);
        node.stop(at + length + 0.05);
      }
    });
    return (offsets.at(-1) ?? 0) + length;
  }

  /** Plays a rising two-note chime and returns its length in seconds. */
  private chime(context: AudioContext, volume: number): number {
    const start = context.currentTime;
    [880, 1320].forEach((frequency, index) => {
      this.note(context, 'sine', frequency, start + index * 0.16, 0.35, 0.35 * volume);
    });
    return 0.55;
  }

  /** Plays two air-horn blasts and returns their length in seconds. */
  private horn(context: AudioContext, volume: number): number {
    const start = context.currentTime;
    for (const offset of [0, 0.55]) {
      for (const frequency of [233, 294, 349]) {
        this.note(context, 'sawtooth', frequency, start + offset, 0.45, 0.12 * volume);
      }
    }
    return 1.05;
  }

  private note(
    context: AudioContext,
    type: OscillatorType,
    frequency: number,
    at: number,
    length: number,
    peak: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  }

  private speak(
    line: string,
    volume: number,
    afterBleep: string | null,
    delaySeconds: number,
  ): void {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined')
      return;
    const utterance = this.utterance(line, volume);
    // Chromium drops event handlers on utterances nothing else references.
    this.speaking = utterance;
    if (afterBleep) {
      const ending = this.utterance(afterBleep, volume);
      let bleeped = false;
      let heardSpeech = false;
      const poll = setInterval(() => {
        // Speech can report it ended well after it went quiet, so this also watches the
        // speaking flag and bleeps as soon as it drops.
        if (speechSynthesis.speaking) heardSpeech = true;
        else if (heardSpeech) bleepThenEnd();
      }, SPEECH_POLL_MS);
      // Chromium on Linux often never reports the end at all, so a timer backs it up.
      const fallback = setTimeout(
        () => bleepThenEnd(),
        (delaySeconds + spokenSeconds(line)) * 1000,
      );
      const bleepThenEnd = () => {
        clearInterval(poll);
        clearTimeout(fallback);
        // Skips the bleep once the nudge was stopped or a newer one started.
        if (bleeped || this.speaking !== utterance) return;
        bleeped = true;
        // A short, flat 1 kHz tone, like a radio edit. It never plays over the voice,
        // because some Linux audio setups drop one of two sounds that play together.
        const context = this.audioContext();
        if (context)
          this.note(context, 'sine', 1000, context.currentTime, RADIO_BLEEP_SECONDS, 0.35 * volume);
        setTimeout(
          () => {
            this.speaking = ending;
            speechSynthesis.speak(ending);
          },
          (RADIO_BLEEP_SECONDS - ENDING_LEAD_SECONDS) * 1000,
        );
      };
      utterance.onend = bleepThenEnd;
    }
    setTimeout(() => {
      // Chromium can leave an earlier utterance stuck in the queue, which blocks this one.
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }, delaySeconds * 1000);
  }

  private utterance(text: string, volume: number): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume;
    utterance.rate = 1.05;
    utterance.pitch = 0.7;
    return utterance;
  }
}
