import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SocketService } from '@core/socket/socket.service';
import { PokerStore, type User } from '../../state/poker.store';
import { GardenCelebrationComponent } from '../garden-celebration/garden-celebration.component';
import { ThrowSceneComponent } from '../../throw-scene/throw-scene.component';
import { PokerTableComponent } from './poker-table.component';

const alice: User = { id: 'a', name: 'Alice', vote: '3', isObserver: false, isApproved: true };
const bob: User = { id: 'b', name: 'Bob', vote: '3', isObserver: false, isApproved: true };
const olive: User = { id: 'o', name: 'Olive', isObserver: true, isApproved: true };

describe('PokerTableComponent', () => {
  beforeEach(() => {
    // The canvas scenes need WebGL/2D contexts; their own specs cover them.
    TestBed.overrideComponent(PokerTableComponent, {
      remove: { imports: [ThrowSceneComponent, GardenCelebrationComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(PokerTableComponent);
    fixture.componentRef.setInput('currentUserId', 'a');
    fixture.componentRef.setInput('players', [alice, bob]);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('renders players, observers and the voting controls from its inputs', () => {
    const fixture = create({ observers: [olive], hasVotes: true });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.users-grid app-player-card')).toHaveLength(2);
    expect(element.querySelector('.obs-label')?.textContent).toContain('Observers · 1');
    const [reveal, reset] = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.table-controls button'),
    );
    expect(reveal?.disabled).toBe(false);
    expect(reset?.disabled).toBe(false);
    const events: string[] = [];
    fixture.componentInstance.reveal.subscribe(() => events.push('reveal'));
    fixture.componentInstance.openPicker.subscribe(() => events.push('picker'));
    reveal?.click();
    element.querySelector<HTMLButtonElement>('.equipped-projectile')?.click();
    expect(events).toEqual(['reveal', 'picker']);
  });

  it('hides the throwable picker when throwing is off', () => {
    const element: HTMLElement = create({ throwingEnabled: false }).nativeElement;
    expect(element.querySelector('.equipped-projectile')).toBeNull();
    expect(element.querySelector('.table-controls')).not.toBeNull();
  });

  it('shows results and the garden celebration for a perfect match on the default theme', () => {
    const element: HTMLElement = create({
      revealed: true,
      isPerfectMatch: true,
      averageVote: '3.0',
      multipliedAverage: '4.5',
    }).nativeElement;
    expect(element.querySelector('app-garden-celebration')).not.toBeNull();
    expect(element.querySelector('.confetti-container')).toBeNull();
    expect(element.querySelector('.table')?.classList.contains('perfect-match')).toBe(true);
    expect(
      Array.from(element.querySelectorAll('.big-number')).map((node) => node.textContent),
    ).toEqual(['3.0', '4.5']);
  });

  it('uses confetti and Vegas details on a named theme', () => {
    const element: HTMLElement = create({
      theme: 'vegas',
      revealed: true,
      isPerfectMatch: true,
    }).nativeElement;
    expect(element.querySelector('app-garden-celebration')).toBeNull();
    expect(element.querySelectorAll('.confetti')).toHaveLength(20);
    expect(element.querySelector('.vegas-reveal-banner')).not.toBeNull();
  });

  it('releases bats and carves a reveal banner in Graveyard Shift', () => {
    const element: HTMLElement = create({
      theme: 'graveyard',
      revealed: true,
      isPerfectMatch: true,
    }).nativeElement;
    expect(element.querySelectorAll('.bat-swarm .bat')).toHaveLength(14);
    expect(element.querySelector('.confetti-container')).toBeNull();
    expect(element.querySelector('.graveyard-reveal-banner')?.textContent?.trim()).toBe(
      'The votes have risen',
    );
  });

  it('names the reveal ceremony after the theme', () => {
    const element: HTMLElement = create({ theme: 'graveyard', isCountdown: true }).nativeElement;
    expect(element.querySelector('.ceremony-label')?.textContent?.trim()).toBe(
      'Final resting estimate',
    );
  });

  it('shows the countdown and hides the controls during the reveal ceremony', () => {
    const element: HTMLElement = create({ isCountdown: true, countdownValue: 2 }).nativeElement;
    expect(element.querySelector('.countdown-number')?.textContent).toBe('2');
    expect(element.querySelector('.ceremony-label')?.textContent?.trim()).toBe('Final reveal');
    expect(element.querySelector('.table-controls')).toBeNull();
  });
});

describe('PokerTableComponent nudges', () => {
  const player = (id: string, hasVoted: boolean, extra: Partial<User> = {}): User => ({
    id,
    name: id,
    isApproved: true,
    isObserver: false,
    hasVoted,
    ...extra,
  });

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: SocketService, useValue: { getSocket: () => ({ on: vi.fn(), off: vi.fn() }) } },
      ],
    });
    TestBed.overrideComponent(PokerTableComponent, {
      remove: { imports: [ThrowSceneComponent, GardenCelebrationComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    const store = TestBed.inject(PokerStore);
    const fixture = TestBed.createComponent(PokerTableComponent);
    // Mirror the room's wiring so the store's player filtering is covered too.
    const sync = () => {
      fixture.componentRef.setInput('players', store.mergedPlayers());
      fixture.componentRef.setInput('hasVotes', store.hasVotes());
      fixture.componentRef.setInput('revealed', store.revealState());
      fixture.componentRef.setInput('isCountdown', store.isCountdown());
    };
    return { store, fixture, table: fixture.componentInstance, sync };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('waits on unvoted, approved players only once someone has voted', () => {
    const { store, fixture, table, sync } = setup();
    store.setUsers([
      player('me', false),
      player('slow', false),
      player('done', false),
      player('watching', false, { isObserver: true }),
      player('pending', false, { isApproved: false }),
    ]);
    sync();
    expect([...table.stragglerIds()]).toEqual([]);

    store.setUsers([
      player('me', false),
      player('slow', false),
      player('done', true),
      player('watching', false, { isObserver: true }),
      player('pending', false, { isApproved: false }),
    ]);
    sync();
    expect([...table.stragglerIds()]).toEqual(['me', 'slow']);
    fixture.componentRef.setInput('currentUserId', 'me');
    expect([...table.stragglerIds()]).toEqual(['slow']);

    store.setRevealState(true);
    sync();
    expect([...table.stragglerIds()]).toEqual([]);
  });

  it('counts down the straggler nudge only while everyone left is cooling down', () => {
    const { store, fixture, table, sync } = setup();
    const nudgeAll = vi.fn<() => void>();
    table.nudgeStragglers.subscribe(nudgeAll);
    store.setUsers([player('me', true), player('slow', false), player('slower', false)]);
    sync();
    fixture.componentRef.setInput('currentUserId', 'me');
    fixture.componentRef.setInput('nudgeCooldowns', new Map([['slow', 9]]));
    expect(table.stragglersCooldown()).toBe(0);

    fixture.componentRef.setInput(
      'nudgeCooldowns',
      new Map([
        ['slow', 9],
        ['slower', 4],
      ]),
    );
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.nudge-stragglers') as HTMLButtonElement;
    expect(table.stragglersCooldown()).toBe(4);
    expect(button.textContent).toContain('Nudge again in 4s');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(nudgeAll).not.toHaveBeenCalled();

    fixture.componentRef.setInput('nudgeCooldowns', new Map());
    fixture.detectChanges();
    button.click();
    expect(nudgeAll).toHaveBeenCalledOnce();
  });
});
