import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { NudgeLevel, RoomMood } from '@poker/shared';
import { readLocalPreference, writeLocalPreference } from '@core/storage/local-preference';
import { NUDGE_SOUND_STORAGE_KEY } from '@core/storage/storage-keys';

export type NudgeSoundSetting = 'loud' | 'quiet' | 'off';
export const NUDGE_SOUND_SETTINGS: readonly { value: NudgeSoundSetting; label: string }[] = [
  { value: 'loud', label: 'Loud' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'off', label: 'Off' },
];

export interface NudgeSoundPlan {
  readonly tone: 'chime' | 'horn';
  /** Spoken after the tone, or null for no voice. */
  readonly line: string | null;
  /** When set, a censor bleep follows the line and then this is spoken, like a radio edit. */
  readonly afterBleep: string | null;
}

export const POLITE_NUDGE_LINE = "We're all waiting on your vote!";
// Spoken as "Vote, mother fuh (BEEP) er", so the bleep lands in the middle of the word.
export const SPICY_NUDGE_LINE = 'Vote, mother fuh';
export const SPICY_NUDGE_ENDING = 'er';

/** Friendly rooms only ever chime; the other moods escalate to a horn and then a yell. */
export function nudgeSoundPlan(level: NudgeLevel, mood: RoomMood): NudgeSoundPlan {
  if (mood === 'friendly' || level === 1) return { tone: 'chime', line: null, afterBleep: null };
  if (level === 2) return { tone: 'horn', line: null, afterBleep: null };
  return mood === 'spicy'
    ? { tone: 'horn', line: SPICY_NUDGE_LINE, afterBleep: SPICY_NUDGE_ENDING }
    : { tone: 'horn', line: POLITE_NUDGE_LINE, afterBleep: null };
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

  play(level: NudgeLevel, mood: RoomMood): void {
    const setting = this.setting();
    if (setting === 'off') return;
    this.playAt(level, mood, VOLUME[setting]);
  }

  /** Plays the loudest nudge for this mood so the person can check what they will hear. */
  test(mood: RoomMood): void {
    const setting = this.setting();
    this.playAt(3, mood, VOLUME[setting === 'off' ? 'quiet' : setting]);
  }

  private playAt(level: NudgeLevel, mood: RoomMood, volume: number): void {
    const plan = nudgeSoundPlan(level, mood);
    const context = this.audioContext();
    // Browsers keep audio suspended until the person has interacted with the page;
    // in that case the visual nudge and tab title still reach them.
    if (context) {
      void context.resume().catch(() => undefined);
      const toneEnd =
        plan.tone === 'chime' ? this.chime(context, volume) : this.horn(context, volume);
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
