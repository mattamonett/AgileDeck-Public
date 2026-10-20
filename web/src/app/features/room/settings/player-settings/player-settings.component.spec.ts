import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerSettingsComponent } from './player-settings.component';
import { PLAYER_SEX_STORAGE_KEY } from '@core/storage/storage-keys';

describe('player sex setting', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [PlayerSettingsComponent] });
  });
  it('saves a selection', () => {
    const fixture = TestBed.createComponent(PlayerSettingsComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.sex-trigger').click();
    fixture.detectChanges();
    const choices = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(choices.length).toBe(2);
    choices[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sex()).toBe('Female');
    expect(localStorage.getItem(PLAYER_SEX_STORAGE_KEY)).toBe('Female');
    expect(fixture.nativeElement.querySelector('[role="option"]')).toBeNull();
    fixture.destroy();
    const next = TestBed.createComponent(PlayerSettingsComponent);
    expect(next.componentInstance.sex()).toBe('Female');
    next.destroy();
  });
  it('closes on panel dismissal and Escape', () => {
    const fixture = TestBed.createComponent(PlayerSettingsComponent);
    fixture.detectChanges();
    fixture.componentInstance.sexOpen.set(true);
    fixture.componentRef.setInput('panelOpen', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.sexOpen()).toBe(false);
    fixture.componentRef.setInput('panelOpen', true);
    fixture.componentInstance.sexOpen.set(true);
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('.sex-trigger')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.sexOpen()).toBe(false);
    fixture.destroy();
  });
  it('stays open for clicks inside the control and closes for clicks outside it', () => {
    const fixture = TestBed.createComponent(PlayerSettingsComponent);
    fixture.detectChanges();
    fixture.componentInstance.sexOpen.set(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.sex-heading').click();
    expect(fixture.componentInstance.sexOpen()).toBe(true);
    document.body.click();
    expect(fixture.componentInstance.sexOpen()).toBe(false);
    fixture.destroy();
  });
  it('emits a mode switch only for the mode that is not active', () => {
    const fixture = TestBed.createComponent(PlayerSettingsComponent);
    fixture.componentRef.setInput('isObserver', true);
    fixture.detectChanges();
    let toggles = 0;
    fixture.componentInstance.toggleObserver.subscribe(() => toggles++);
    const [player, observer] = fixture.nativeElement.querySelectorAll('.toggle-group button');
    expect(observer.classList.contains('active')).toBe(true);
    observer.click();
    expect(toggles).toBe(0);
    player.click();
    expect(toggles).toBe(1);
    fixture.destroy();
  });
  it('reflects the nudge sound preference and emits changes and tests', () => {
    const fixture = TestBed.createComponent(PlayerSettingsComponent);
    fixture.componentRef.setInput('nudgeSoundSetting', 'quiet');
    fixture.componentRef.setInput('hasVoice', false);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const events: unknown[] = [];
    fixture.componentInstance.nudgeSoundChange.subscribe((value) => events.push(value));
    fixture.componentInstance.testNudgeSound.subscribe(() => events.push('test'));
    const choices = Array.from(
      element.querySelectorAll<HTMLButtonElement>('[aria-labelledby="nudge-sound-label"] button'),
    );
    expect(choices.map((choice) => choice.getAttribute('aria-pressed'))).toContain('true');
    expect(
      choices.find((choice) => choice.getAttribute('aria-pressed') === 'true')?.textContent,
    ).toContain('Quiet');
    expect(element.textContent).toContain('no speech voice');
    choices[0]?.click();
    element.querySelector<HTMLButtonElement>('.nudge-test')?.click();
    expect(events).toEqual(['loud', 'test']);
    fixture.destroy();
  });
});
