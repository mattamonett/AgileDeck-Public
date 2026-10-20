import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SitePasswordFormComponent } from '@shared/access/site-password-form.component';
import { FeedbackAdminComponent } from './feedback-admin.component';
import { resolveApiUrl } from '@core/api/api-url';

const API = resolveApiUrl();

const item = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'bug',
  title: '<img src=x> Voting bug',
  body: 'A sufficiently detailed report.',
  createdAt: '2026-09-30T00:00:00.000Z',
  status: 'rejected',
  rejectionReason: 'Potential personal information.',
  workflowStatus: 'new',
  resolutionReason: null,
  resolutionNote: null,
  duplicateOfId: null,
};
const emptyQueue = { feedback: [], feedbackCount: 0, replies: [], replyCount: 0 };
const signedIn = { signedIn: true, environment: 'development' };
describe('FeedbackAdminComponent', () => {
  let sessionStatus: Response;
  let feedbackStatus: number;
  beforeEach(async () => {
    sessionStatus = new Response(JSON.stringify(signedIn));
    feedbackStatus = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/init')) return new Response(JSON.stringify({ status: 'ok' }));
        if (url.endsWith('/session')) {
          if (options?.method === 'POST') return new Response(JSON.stringify(signedIn));
          if (options?.method === 'DELETE')
            return new Response(JSON.stringify({ signedIn: false }));
          return sessionStatus;
        }
        if (url.endsWith('/pending')) return new Response(JSON.stringify(emptyQueue));
        if (options?.method === 'PATCH') {
          const body: unknown = JSON.parse(typeof options.body === 'string' ? options.body : '{}');
          if (
            !body ||
            typeof body !== 'object' ||
            !('next' in body) ||
            !body.next ||
            typeof body.next !== 'object'
          )
            throw new Error('Missing workflow.');
          return new Response(JSON.stringify({ ...item, ...body.next }));
        }
        if (feedbackStatus !== 200)
          return new Response(
            JSON.stringify({ message: 'Sign in to the admin page to continue.' }),
            {
              status: feedbackStatus,
            },
          );
        return new Response(JSON.stringify({ items: [item], nextCursor: null }));
      }),
    );
    await TestBed.configureTestingModule({ imports: [FeedbackAdminComponent] }).compileComponents();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function calls(path: string, method = 'GET') {
    return vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, options]) => String(url) === API + path && (options?.method ?? 'GET') === method,
      );
  }

  it('asks the API for the session with the admin cookie and opens the tabs', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const [session] = calls('/api/admin/session');
    expect(session?.[1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
    expect(fixture.componentInstance.session.access()).toBe('signed-in');
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.tabs')).not.toBeNull();
    expect(element.textContent).toContain('development database');
    expect(fixture.componentInstance.items()).toHaveLength(1);
  });

  it('explains how to turn the admin page on when the API says it is off', async () => {
    sessionStatus = new Response(JSON.stringify({ message: 'Admin endpoint not found.' }), {
      status: 404,
    });
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('The admin page is off');
    expect(element.textContent).toContain('ADMIN_PASSWORD');
    expect(element.querySelector('.tabs')).toBeNull();
    expect(element.querySelector('input[type="password"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('signs in with the admin password and then loads the feedback', async () => {
    sessionStatus = new Response(JSON.stringify({ signedIn: false }));
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.tabs')).toBeNull();
    expect(element.querySelector('label[for="admin-password"]')?.textContent).toBe(
      'Admin password',
    );
    const form = fixture.debugElement.query(By.directive(SitePasswordFormComponent))
      .componentInstance as SitePasswordFormComponent;
    form.password.set('a long admin password');
    await form.submit();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls('/api/init')).toHaveLength(1);
    const [post] = calls('/api/admin/session', 'POST');
    expect(post?.[1]).toMatchObject({
      credentials: 'include',
      body: JSON.stringify({ password: 'a long admin password' }),
    });
    expect(fixture.componentInstance.session.access()).toBe('signed-in');
    await vi.waitFor(() => expect(fixture.componentInstance.items()).toHaveLength(1));
    expect(element.querySelector('.tabs')).not.toBeNull();
  });

  it('returns to the sign-in form when the API refuses the admin cookie', async () => {
    feedbackStatus = 401;
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.session.access()).toBe('signed-out');
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('signs out and shows the sign-in form', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = [...element.querySelectorAll<HTMLButtonElement>('header button')].find(
      (entry) => entry.textContent?.trim() === 'Sign out',
    );
    if (!button) throw new Error('Missing sign-out button');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls('/api/admin/session', 'DELETE')[0]?.[1]).toMatchObject({
      credentials: 'include',
    });
    expect(fixture.componentInstance.session.access()).toBe('signed-out');
    expect(fixture.componentInstance.items()).toEqual([]);
    expect(element.textContent).not.toContain('development database');
    expect(element.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('shows the admin rejection reason and treats titles as text', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    const entry = fixture.componentInstance.items()[0];
    if (!entry) throw new Error('Missing feedback.');
    fixture.componentInstance.select(entry);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('development database');
    expect(element.textContent).toContain(item.title);
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('[role="meter"]')).toBeNull();
    expect(element.textContent).not.toMatch(/\bAI\b/);
    expect(element.textContent).toContain(
      'Reason shown to the author: Potential personal information.',
    );
  });

  it('opens on the pending review queue', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.activeTab()).toBe('pending');
    expect(element.querySelector('.tabs button')?.textContent).toContain('Pending Review');
    expect(element.querySelector('app-pending-review')?.hasAttribute('hidden')).toBe(false);
    expect(
      element.querySelector('section[aria-label="Feedback Review"]')?.hasAttribute('hidden'),
    ).toBe(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('No feedback is waiting for review.');
    });
  });

  it('switches between Rooms and Feedback Review while preserving the selected feedback', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.activeTab.set('feedback');
    const feedback = component.items()[0];
    if (!feedback) throw new Error('Missing feedback.');
    component.select(feedback);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    );
    element.querySelectorAll<HTMLButtonElement>('.tabs button')[2]?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-room-admin')).not.toBeNull();
    expect(
      element.querySelector('section[aria-label="Feedback Review"]')?.hasAttribute('hidden'),
    ).toBe(true);
    element.querySelectorAll<HTMLButtonElement>('.tabs button')[1]?.click();
    fixture.detectChanges();
    expect(element.querySelector('app-room-admin')).toBeNull();
    expect(component.selected()?.id).toBe(feedback.id);
    expect(
      element.querySelector('section[aria-label="Feedback Review"]')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('starts with closed feedback hidden and lets a status filter override the toggle', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const lastQuery = () =>
      new URL(
        String(
          vi
            .mocked(fetch)
            .mock.calls.filter(([url]) => String(url).startsWith(API + '/api/admin/feedback?'))
            .at(-1)?.[0],
        ),
        'http://localhost',
      ).searchParams;
    expect(lastQuery().get('includeClosed')).toBe('false');
    expect(lastQuery().has('workflowStatus')).toBe(false);

    const toggle = element.querySelector<HTMLButtonElement>('.closed-filter');
    if (!toggle) throw new Error('Missing closed feedback filter');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(lastQuery().get('includeClosed')).toBe('true');

    fixture.componentInstance.statusFilter.set('closed');
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(lastQuery().get('workflowStatus')).toBe('closed');
    expect(lastQuery().has('includeClosed')).toBe(false);
    expect(element.querySelector('.closed-filter')).toBeNull();
  });

  it('saves a human resolution with the previous workflow and clears resolution fields when reopening', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const entry = component.items()[0];
    if (!entry) throw new Error('Missing feedback.');
    component.select(entry);
    component.setWorkflow('closed');
    component.setReason('fixed');
    component.note.set('Fixed after reconnecting.');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...item,
          workflowStatus: 'closed',
          resolutionReason: 'fixed',
          resolutionNote: 'Fixed after reconnecting.',
        }),
      ),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    );
    await component.save();
    expect(component.items()).toHaveLength(0);
    expect(component.selected()).toMatchObject({
      workflowStatus: 'closed',
      resolutionReason: 'fixed',
      status: 'rejected',
    });
    const body = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body;
    expect(typeof body === 'string' ? JSON.parse(body) : null).toMatchObject({
      previous: { workflowStatus: 'new' },
      next: { workflowStatus: 'closed', resolutionNote: 'Fixed after reconnecting.' },
    });
    component.setWorkflow('new');
    await component.save();
    expect(component.selected()).toMatchObject({
      workflowStatus: 'new',
      resolutionReason: null,
      resolutionNote: null,
      duplicateOfId: null,
    });
  });

  it('requires an original for duplicates and keeps edits visible after a conflicting save', async () => {
    const fixture = TestBed.createComponent(FeedbackAdminComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const entry = component.items()[0];
    if (!entry) throw new Error('Missing feedback.');
    component.select(entry);
    component.setWorkflow('closed');
    component.setReason('duplicate');
    await component.save();
    expect(component.error()).toContain('original');
    expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(
      false,
    );
    component.setReason('fixed');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'This feedback changed in another tab. Reload it before saving.',
        }),
        { status: 409 },
      ),
    );
    await component.save();
    expect(component.error()).toContain('another tab');
    expect(component.workflowStatus()).toBe('closed');
    expect(component.selected()?.workflowStatus).toBe('new');
  });
});
