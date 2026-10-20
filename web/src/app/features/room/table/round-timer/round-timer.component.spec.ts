import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRoundTime, RoundTimerComponent } from './round-timer.component';

describe('formatRoundTime', () => {
  it('shows minutes and seconds, adding hours only when needed', () => {
    expect(formatRoundTime(0)).toBe('0:00');
    expect(formatRoundTime(9_999)).toBe('0:09');
    expect(formatRoundTime(605_000)).toBe('10:05');
    expect(formatRoundTime(3_723_000)).toBe('1:02:03');
    expect(formatRoundTime(-500)).toBe('0:00');
  });
});

describe('RoundTimerComponent', () => {
  let fixture: ComponentFixture<RoundTimerComponent>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    fixture = TestBed.createComponent(RoundTimerComponent);
  });
  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('counts up locally while running without any further input', () => {
    fixture.componentRef.setInput('clock', { startedAt: 100_000 - 59_500, stoppedAt: null });
    fixture.detectChanges();
    expect(text()).toBe('Round 0:59');
    vi.advanceTimersByTime(600);
    fixture.detectChanges();
    expect(text()).toBe('Round 1:00');
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(text()).toBe('Round 2:00');
  });

  it('shows a frozen duration and stops ticking once revealed', () => {
    fixture.componentRef.setInput('clock', { startedAt: 10_000, stoppedAt: null });
    fixture.detectChanges();
    expect(vi.getTimerCount()).toBe(1);
    fixture.componentRef.setInput('clock', { startedAt: 10_000, stoppedAt: 95_000 });
    fixture.detectChanges();
    expect(text()).toBe('Round took 1:25');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('speaks each theme in its own words and falls back to the garden look', () => {
    const host = fixture.nativeElement as HTMLElement;
    const cases = [
      ['space', 'Mission T+ 0:30', 'Landed T+ 0:30'],
      ['retro', '> round 0:30', '> halted 0:30'],
      ['vegas', 'On the clock 0:30', 'Final time 0:30'],
      ['graveyard', 'Graveyard shift 0:30', 'Time of death 0:30'],
      ['harvest', 'Roasting 0:30', 'Served in 0:30'],
      ['cabin', 'By the fire 0:30', 'Toasty for 0:30'],
      ['unknown', 'Round 0:30', 'Round took 0:30'],
    ] as const;
    for (const [theme, running, stopped] of cases) {
      fixture.componentRef.setInput('theme', theme);
      fixture.componentRef.setInput('clock', { startedAt: 70_000, stoppedAt: null });
      fixture.detectChanges();
      expect(text()).toBe(running);
      expect(host.dataset['look']).toBe(theme === 'unknown' ? 'default' : theme);
      fixture.componentRef.setInput('clock', { startedAt: 70_000, stoppedAt: 100_000 });
      fixture.detectChanges();
      expect(text()).toBe(stopped);
      expect(host.classList.contains('stopped')).toBe(true);
    }
  });

  it('turns the dial hand one notch per second, always forwards', () => {
    fixture.componentRef.setInput('clock', { startedAt: 100_000 - 61_000, stoppedAt: null });
    fixture.detectChanges();
    const hand = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.hand');
    expect(hand?.style.transform).toBe('rotate(366deg)');
  });

  it('renders nothing and schedules nothing without a known round start', () => {
    fixture.detectChanges();
    expect(text()).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops ticking when destroyed', () => {
    fixture.componentRef.setInput('clock', { startedAt: 100_000, stoppedAt: null });
    fixture.detectChanges();
    expect(vi.getTimerCount()).toBe(1);
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
