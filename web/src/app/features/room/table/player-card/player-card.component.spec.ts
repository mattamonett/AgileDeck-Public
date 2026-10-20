import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerCardComponent } from './player-card.component';

describe('player throws', () => {
  let fixture: ComponentFixture<PlayerCardComponent>;
  let component: PlayerCardComponent;
  let throwSpy = vi.fn<() => void>();
  let barrageSpy = vi.fn<() => void>();
  beforeEach(() => {
    fixture = TestBed.createComponent(PlayerCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('user', {
      id: 'teammate',
      name: 'June',
      isObserver: false,
      isApproved: true,
    });
    fixture.detectChanges();
    vi.useFakeTimers();
    throwSpy = vi.fn();
    barrageSpy = vi.fn();
    component.throw.subscribe(throwSpy);
    component.barrage.subscribe(barrageSpy);
  });
  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });
  function press() {
    component.handlePointerDown(new PointerEvent('pointerdown', { button: 0, isPrimary: true }));
  }
  it('throws on an ordinary press including a deliberate half-second click', () => {
    press();
    vi.advanceTimersByTime(500);
    component.handlePointerUp();
    component.handleCardClick(new Event('click'));
    expect(throwSpy).toHaveBeenCalledOnce();
    expect(barrageSpy).not.toHaveBeenCalled();
  });
  it('sends one barrage and suppresses the trailing click', () => {
    press();
    vi.advanceTimersByTime(2200);
    component.handlePointerUp();
    component.handleCardClick(new Event('click'));
    expect(barrageSpy).toHaveBeenCalledOnce();
    expect(throwSpy).not.toHaveBeenCalled();
  });
  it('cancels a touch hold when the browser begins scrolling', () => {
    press();
    vi.advanceTimersByTime(500);
    component.handlePointerCancel();
    vi.advanceTimersByTime(2500);
    component.handleCardClick(new Event('click'));
    expect(barrageSpy).not.toHaveBeenCalled();
    expect(throwSpy).not.toHaveBeenCalled();
  });
  it('supports keyboard throws and blocks self-targeting or revealed cards', () => {
    component.handleKeyboardThrow(new Event('keydown'));
    expect(throwSpy).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('isCurrent', true);
    component.handleKeyboardThrow(new Event('keydown'));
    fixture.componentRef.setInput('isCurrent', false);
    fixture.componentRef.setInput('revealState', true);
    component.handleKeyboardThrow(new Event('keydown'));
    expect(throwSpy).toHaveBeenCalledOnce();
  });
  it('is not a throw target when the site turns throwing off', () => {
    fixture.componentRef.setInput('throwable', false);
    fixture.detectChanges();
    press();
    vi.advanceTimersByTime(2500);
    component.handlePointerUp();
    component.handleCardClick(new Event('click'));
    component.handleKeyboardThrow(new Event('keydown'));
    expect(throwSpy).not.toHaveBeenCalled();
    expect(barrageSpy).not.toHaveBeenCalled();
    const card: HTMLElement = fixture.nativeElement.querySelector('.card-display');
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('aria-label')).toBe('June is choosing');
  });
  it('does not finish a barrage after a reveal', () => {
    press();
    vi.advanceTimersByTime(500);
    fixture.componentRef.setInput('revealState', true);
    fixture.detectChanges();
    vi.advanceTimersByTime(2500);
    expect(barrageSpy).not.toHaveBeenCalled();
  });

  it('renders observers as labeled targets with click, keyboard, and hold controls', () => {
    fixture.componentRef.setInput('user', { ...component.user(), isObserver: true });
    fixture.detectChanges();
    const card: HTMLElement = fixture.nativeElement.querySelector('.card-display');
    expect(card.getAttribute('aria-label')).toBe('Throw at June (observer)');
    expect(fixture.nativeElement.querySelector('.is-observer')).toBeTruthy();
    expect(card.textContent).toContain('Observer');
    card.click();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(throwSpy).toHaveBeenCalledTimes(2);
    press();
    vi.advanceTimersByTime(2200);
    expect(barrageSpy).toHaveBeenCalledOnce();
  });

  it('shows overheating to viewers, cools down, and blocks outgoing throws only', () => {
    const now = Date.now();
    fixture.componentRef.setInput('user', {
      ...component.user(),
      throwOverheat: { startedAt: now, until: now + 5000 },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.overheat-badge').textContent).toContain('5s');
    component.handleKeyboardThrow(new Event('keydown'));
    expect(throwSpy).toHaveBeenCalledOnce(); // Others can still throw at this player.
    fixture.componentRef.setInput('throwBlockedUntil', now + 5000);
    fixture.detectChanges();
    component.handleKeyboardThrow(new Event('keydown'));
    press();
    vi.advanceTimersByTime(2500);
    expect(throwSpy).toHaveBeenCalledOnce();
    expect(barrageSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.overheat-badge')).toBeNull();
    component.handleKeyboardThrow(new Event('keydown'));
    expect(throwSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps observer identity after reveal without displaying a vote or enabling throws', () => {
    fixture.componentRef.setInput('user', {
      ...component.user(),
      isObserver: true,
      hasVoted: true,
      vote: '5',
    });
    fixture.componentRef.setInput('revealState', true);
    fixture.detectChanges();
    const card: HTMLElement = fixture.nativeElement.querySelector('.card-display');
    expect(card.getAttribute('aria-label')).toBe('June is observing');
    expect(card.getAttribute('role')).toBeNull();
    expect(card.classList.contains('revealed')).toBe(false);
    expect(fixture.nativeElement.querySelector('.vote-chip')).toBeNull();
    card.click();
    expect(throwSpy).not.toHaveBeenCalled();
  });
});

describe('player nudge button', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows a countdown and ignores clicks while the player cannot be nudged', () => {
    const fixture = TestBed.createComponent(PlayerCardComponent);
    const nudge = vi.fn<() => void>();
    fixture.componentInstance.nudge.subscribe(nudge);
    fixture.componentRef.setInput('user', {
      id: 'teammate',
      name: 'June',
      isObserver: false,
      isApproved: true,
    });
    fixture.componentRef.setInput('nudgeable', true);
    fixture.componentRef.setInput('nudgeCooldownSeconds', 12);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.nudge-btn') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('12');
    expect(button.title).toBe('June was just nudged. You can nudge again in 12s.');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(nudge).not.toHaveBeenCalled();

    fixture.componentRef.setInput('nudgeCooldownSeconds', 0);
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('📢');
    expect(button.title).toBe('Nudge June to vote');
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    button.click();
    expect(nudge).toHaveBeenCalledOnce();
  });
});
