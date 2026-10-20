import { TestBed } from '@angular/core/testing';
import type { Room, User } from '../../state/poker.models';
import { RoomSettingsPanelComponent } from './room-settings-panel.component';
import { THEMES, Theme } from '@poker/shared';

const room: Room = {
  id: 'room',
  name: 'Room',
  reveal: false,
  autoReveal: true,
  useMultiplier: false,
  multiplierValue: 1,
  theme: 'space',
  lobbyEnabled: true,
  issuesEnabled: false,
  mood: 'spicy',
  roundClock: null,
};
const pending: User = { id: 'u1', name: 'Newcomer', isObserver: false, isApproved: false };

describe('RoomSettingsPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(RoomSettingsPanelComponent);
    fixture.componentRef.setInput('room', room);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  function button(element: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
  }

  it('reflects the room settings it is given', () => {
    const element: HTMLElement = create().nativeElement;
    expect(button(element, 'Auto')?.classList.contains('active')).toBe(true);
    expect(button(element, 'Spicy')?.getAttribute('aria-pressed')).toBe('true');
    const issueToggles = element.querySelectorAll(
      '[aria-labelledby="issues-setting-label"] button',
    );
    expect(issueToggles[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.theme-btn.active')?.textContent).toContain('Deep Space');
  });

  it('emits approval, issue, mood and health actions instead of calling the server', () => {
    const fixture = create({ pendingApprovals: [pending] });
    const component = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;
    const events: unknown[] = [];
    component.approveUser.subscribe((id) => events.push(['approve', id]));
    component.denyUser.subscribe((id) => events.push(['deny', id]));
    component.setIssuesEnabled.subscribe((enabled) => events.push(['issues', enabled]));
    component.setRoomMood.subscribe((mood) => events.push(['mood', mood]));
    component.refreshHealth.subscribe(() => events.push(['health']));

    expect(element.querySelector('.pending-user')?.textContent).toContain('Newcomer');
    element.querySelector<HTMLButtonElement>('.approve-btn')?.click();
    element.querySelector<HTMLButtonElement>('.deny-btn')?.click();
    element
      .querySelectorAll<HTMLButtonElement>('[aria-labelledby="issues-setting-label"] button')[1]
      ?.click();
    button(element, 'Friendly')?.click();
    element.querySelector<HTMLButtonElement>('.refresh-btn')?.click();

    expect(events).toEqual([
      ['approve', 'u1'],
      ['deny', 'u1'],
      ['issues', true],
      ['mood', 'friendly'],
      ['health'],
    ]);
  });

  it("offers only the site's moods and themes", () => {
    const element: HTMLElement = create({
      moods: ['friendly', 'playful'],
      themes: THEMES.filter((theme) => theme.id !== Theme.VEGAS),
    }).nativeElement;
    expect(button(element, 'Friendly')).toBeDefined();
    expect(button(element, 'Spicy')).toBeUndefined();
    expect(element.querySelectorAll('.theme-btn')).toHaveLength(THEMES.length - 1);
    expect(element.textContent).toContain('throwables');
    expect(element.textContent).not.toContain('Spicy');
  });

  it('hides a picker that has only one choice', () => {
    const element: HTMLElement = create({
      moods: ['friendly'],
      themes: THEMES.filter((theme) => theme.id === Theme.SPACE),
    }).nativeElement;
    expect(element.querySelector('#room-mood-label')).toBeNull();
    expect(element.querySelector('.theme-btn')).toBeNull();
  });

  it('marks the default mood before a room loads and drops throwables from the hint', () => {
    const fixture = TestBed.createComponent(RoomSettingsPanelComponent);
    fixture.componentRef.setInput('defaultMood', 'friendly');
    fixture.componentRef.setInput('throwingEnabled', false);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(button(element, 'Friendly')?.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.setting-hint')?.textContent).not.toContain('throwables');
  });

  it('shows connection and health state', () => {
    const fixture = create({
      isConnected: false,
      healthStatus: { api: 'healthy', db: 'unhealthy', timestamp: new Date().toISOString() },
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector<HTMLButtonElement>('.refresh-btn')?.disabled).toBe(true);
    expect(element.textContent).toContain('Lost connection to server.');
    const indicators = Array.from(element.querySelectorAll('.status-indicator')).map((node) =>
      node.textContent?.trim(),
    );
    expect(indicators).toEqual(['Disconnected', 'Healthy', 'Unhealthy']);
  });

  it('leaves out the issues setting when the site has issues turned off', () => {
    const element: HTMLElement = create({ issuesAvailable: false }).nativeElement;
    expect(element.querySelector('#issues-setting-label')).toBeNull();
    expect(element.textContent).toContain('Board Theme');
  });
});
