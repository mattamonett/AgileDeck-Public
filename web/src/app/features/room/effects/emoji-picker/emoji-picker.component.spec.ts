import { TestBed } from '@angular/core/testing';
import type { EmojiDefinition } from '@poker/shared';
import { EmojiPickerComponent } from './emoji-picker.component';

describe('EmojiPickerComponent', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

  async function setup(allEmojis: readonly EmojiDefinition[]) {
    await TestBed.configureTestingModule({ imports: [EmojiPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(EmojiPickerComponent);
    fixture.componentRef.setInput('allEmojis', allEmojis);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const section = (heading: string) =>
      Array.from(root.querySelectorAll('.picker-section')).find(
        (el) => el.querySelector('h4')?.textContent?.trim() === heading,
      );
    const chars = (el: Element | undefined) =>
      Array.from(el?.querySelectorAll('.emoji-pick-btn') ?? []).map((btn) =>
        btn.textContent?.trim(),
      );
    return { fixture, root, section, chars };
  }

  it('lists recently added throwables in a New section and badges them', async () => {
    const { section, chars } = await setup([
      { char: '🍅', tags: 'tomato food' },
      { char: '🦖', tags: 'dino animal', addedOn: daysAgo(40) },
      { char: '🪚', tags: 'chainsaw saw', addedOn: daysAgo(2) },
    ]);

    expect(chars(section('New'))).toEqual(['🪚']);
    const all = section('All Emojis');
    expect(chars(all)).toEqual(['🍅', '🦖', '🪚']);
    const badged = Array.from(all?.querySelectorAll('.emoji-pick-btn') ?? []).filter((btn) =>
      btn.querySelector('.new-badge'),
    );
    expect(badged.map((btn) => btn.getAttribute('aria-label'))).toEqual(['Chainsaw Maniac · New']);
  });

  it('hides the New section when nothing is new or while searching', async () => {
    const { fixture, section } = await setup([{ char: '🍅', tags: 'tomato food' }]);
    expect(section('New')).toBeUndefined();

    fixture.componentRef.setInput('allEmojis', [
      { char: '🪚', tags: 'chainsaw saw', addedOn: daysAgo(0) },
    ]);
    fixture.detectChanges();
    expect(section('New')).toBeDefined();

    fixture.componentInstance.searchQuery.set('saw');
    fixture.detectChanges();
    expect(section('New')).toBeUndefined();
    expect(section('Search Results')?.querySelector('.new-badge')).not.toBeNull();
  });
});
