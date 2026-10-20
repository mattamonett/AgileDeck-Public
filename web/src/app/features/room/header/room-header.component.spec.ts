import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoomHeaderComponent } from './room-header.component';

describe('RoomHeaderComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(RoomHeaderComponent);
    fixture.componentRef.setInput('roomId', 'abc');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('announces people waiting in the lobby on the room settings button', () => {
    const element: HTMLElement = create({ pendingCount: 2 }).nativeElement;
    const button = element.querySelector('.room-settings-toggle');
    expect(button?.getAttribute('aria-label')).toBe(
      'Room Settings — 2 people waiting in the lobby',
    );
    expect(element.querySelector('.pending-badge')?.textContent?.trim()).toBe('2');
  });

  it('caps the badge and hides it when nobody is waiting', () => {
    const fixture = create({ pendingCount: 120 });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.pending-badge')?.textContent).toContain('99+');
    fixture.componentRef.setInput('pendingCount', 0);
    fixture.detectChanges();
    expect(element.querySelector('.pending-badge')).toBeNull();
    expect(element.querySelector('h2')?.textContent).toBe('Room #abc');
  });

  it('shows the disconnected dot only while offline', () => {
    const fixture = create({});
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.disconnected-dot')).toBeNull();
    fixture.componentRef.setInput('isConnected', false);
    fixture.detectChanges();
    expect(element.querySelector('.disconnected-dot')).not.toBeNull();
  });

  it('shows a quiet dot on the feedback button only when the visitor has feedback news', async () => {
    const fixture = TestBed.createComponent(RoomHeaderComponent);
    fixture.componentRef.setInput('roomId', 'abcd1234');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = () => element.querySelector('.feedback-toggle');
    expect(button()?.querySelector('.update-dot')).toBeNull();
    expect(button()?.getAttribute('aria-label')).toBe('Feedback');

    fixture.componentRef.setInput('hasFeedbackUpdates', true);
    fixture.detectChanges();
    expect(button()?.querySelector('.update-dot')).not.toBeNull();
    expect(button()?.getAttribute('aria-label')).toBe('Feedback — updates on your submissions');
  });

  it('leaves out the feedback button when the site has feedback turned off', () => {
    const element: HTMLElement = create({
      showFeedback: false,
      hasFeedbackUpdates: true,
    }).nativeElement;
    expect(element.querySelector('.feedback-toggle')).toBeNull();
  });
});
