import { TestBed } from '@angular/core/testing';
import { PokerHandComponent } from './poker-hand.component';

describe('PokerHandComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(PokerHandComponent);
    fixture.componentRef.setInput('cards', ['1', '4', '?']);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('marks the selected vote and emits clicked cards', () => {
    const fixture = create({ selectedVote: '4' });
    const component = fixture.componentInstance;
    const votes: string[] = [];
    component.vote.subscribe((card) => votes.push(card));
    const buttons = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.poker-card'),
    );
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Estimate 1 (Fibonacci)');
    expect(buttons[1]?.classList.contains('is-fibonacci')).toBe(false);
    buttons[2]?.click();
    expect(votes).toEqual(['?']);
  });

  it('disables cards once votes are revealed', () => {
    const fixture = create({ revealed: true });
    const buttons = fixture.nativeElement.querySelectorAll('.poker-card');
    expect(Array.from<HTMLButtonElement>(buttons).every((button) => button.disabled)).toBe(true);
  });

  it('offers observers a way back to playing instead of the hand', () => {
    const fixture = create({ isObserver: true });
    const toggles: unknown[] = [];
    fixture.componentInstance.toggleObserver.subscribe(() => toggles.push(true));
    expect(fixture.nativeElement.querySelector('.hand-area')).toBeNull();
    fixture.nativeElement.querySelector('.link-btn')?.click();
    expect(toggles).toHaveLength(1);
  });
});
