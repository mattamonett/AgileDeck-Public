import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { FeedbackComponent } from './feedback.component';
import { FeedbackFormComponent } from './feedback-form.component';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '@core/config/site-config.service';

const FEEDBACK_AGREEMENT_VERSION = FALLBACK_SITE_CONFIG.legal.agreementVersion;

function composeForm(fixture: ComponentFixture<FeedbackComponent>): FeedbackFormComponent {
  fixture.componentInstance.switchTab('write');
  fixture.detectChanges();
  const form = fixture.debugElement.query(By.directive(FeedbackFormComponent));
  if (!form) throw new Error('Missing feedback form');
  return form.componentInstance as FeedbackFormComponent;
}

const item = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'general',
  title: '<img src=x onerror=alert(1)>',
  body: 'A plain text description from the server.',
  createdAt: '2026-09-27T00:00:00.000Z',
  isOwn: true,
  workflowStatus: 'new',
  resolutionReason: null,
  resolutionNote: null,
  duplicateOfId: null,
  voteCounts: { agree: 0, disagree: 0, seen_too: 0, would_use: 0, not_for_me: 0, would_throw: 0 },
  userVote: null,
};
const bugItem = {
  ...item,
  id: '10000000-0000-4000-8000-000000000002',
  category: 'bug',
  title: 'Voting bug',
  isOwn: false,
};
const counts = { general: 1, bug: 1, feature_request: 0, new_character_request: 0 };

function lastRequestedUrl(): URL {
  const input = vi.mocked(fetch).mock.lastCall?.[0];
  if (typeof input !== 'string') throw new Error('Expected a feedback URL.');
  return new URL(input);
}

describe('FeedbackComponent', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PUT' || options?.method === 'DELETE') {
          const voting = options.method === 'PUT';
          return new Response(
            JSON.stringify({
              voteCounts: { ...item.voteCounts, seen_too: voting ? 1 : 0 },
              userVote: voting ? 'seen_too' : null,
            }),
          );
        }
        if (options?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: item.id,
              category: 'bug',
              title: 'Voting bug',
              body: item.body,
              createdAt: item.createdAt,
              status: 'pending',
              workflowStatus: 'new',
              resolutionReason: null,
              resolutionNote: null,
              duplicateOfId: null,
              rejectionReason: null,
            }),
            { status: 201 },
          );
        }
        if (url.includes('/mine'))
          return new Response(JSON.stringify({ items: [], nextCursor: null }));
        const category = new URL(url).searchParams.get('category');
        const items = category === 'bug' ? [bugItem] : category === 'general' ? [item] : [];
        return new Response(JSON.stringify({ items, nextCursor: null, counts }));
      }),
    );
    await TestBed.configureTestingModule({
      imports: [FeedbackComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('shows server text without creating HTML and offers both tabs', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain(item.title);
    expect(element.querySelector('article img')).toBeNull();
    expect(element.querySelector('#read-panel')?.textContent).not.toContain('Waiting for review');
    expect(element.querySelectorAll('.tabs [role="tab"]')).toHaveLength(3);
    expect(Array.from(element.querySelectorAll('.tabs [role="tab"]'), (tab) => tab.id)).toEqual([
      'read-tab',
      'write-tab',
      'mine-tab',
    ]);
    expect(element.textContent).toContain('You');
    expect(element.querySelector('app-feedback-status')?.textContent).toContain('New');
    expect(element.querySelector('app-feedback-status')?.textContent).not.toContain('Under Review');
  });

  it('shows a counted tab for each type and filters the visible entries', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = element.querySelectorAll('.type-tabs [role="tab"]');
    expect(tabs).toHaveLength(4);
    const generalTab = tabs.item(0);
    const bugTab = tabs.item(1);
    if (!generalTab || !bugTab) throw new Error('Feedback type tabs are missing.');
    expect(generalTab.textContent).toContain('General feedback');
    expect(generalTab.textContent).toContain('1');
    expect(bugTab.textContent).toContain('Bug');
    bugTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Voting bug');
    expect(element.textContent).not.toContain(item.title);
    expect(bugTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows human review status and explains closure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            { ...item, workflowStatus: 'under_review' },
            {
              ...bugItem,
              workflowStatus: 'closed',
              resolutionReason: 'fixed',
              resolutionNote: 'The vote button now works after reconnecting.',
            },
          ],
          counts,
          nextCursor: null,
        }),
      ),
    );
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const cards = element.querySelectorAll('article');
    expect(cards.item(0)?.textContent).toContain('Under Review');
    expect(cards.item(0)?.textContent).not.toContain('Published');
    expect(cards.item(1)?.textContent).toContain('Closed');
    expect(cards.item(1)?.textContent).toContain('Fixed');
    expect(cards.item(1)?.textContent).toContain('The vote button now works after reconnecting.');
  });

  it('starts with closed feedback hidden, resets paging on toggle, and leaves My submissions unfiltered', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lastRequestedUrl().searchParams.get('includeClosed')).toBe('false');
    const element: HTMLElement = fixture.nativeElement;
    const toggle = element.querySelector<HTMLButtonElement>('.closed-filter');
    if (!toggle) throw new Error('Missing closed feedback filter');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fixture.componentInstance.nextCursor.set('previous-page');
    toggle.click();
    await fixture.whenStable();
    expect(lastRequestedUrl().searchParams.get('includeClosed')).toBe('true');
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(lastRequestedUrl().searchParams.has('cursor')).toBe(false);
    const closed = {
      id: item.id,
      category: item.category,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      resolutionNote: null,
      duplicateOfId: null,
      workflowStatus: 'closed',
      resolutionReason: 'fixed',
      status: 'published',
      rejectionReason: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [closed], nextCursor: null })),
    );
    fixture.componentInstance.switchTab('mine');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lastRequestedUrl().pathname).toBe('/api/feedback/mine');
    expect(lastRequestedUrl().searchParams.has('includeClosed')).toBe(false);
    expect(element.querySelector('#mine-panel')?.textContent).toContain('Closed');
    expect(element.querySelector('.closed-filter')).toBeNull();
  });

  it('switches between newest and top sorting for each category', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const sortButtons = element.querySelectorAll<HTMLButtonElement>('.sort-controls button');
    const newestButton = sortButtons.item(0);
    const topButton = sortButtons.item(1);
    if (!newestButton || !topButton) throw new Error('Sort controls are missing.');
    expect(lastRequestedUrl().searchParams.get('sort')).toBe('newest');

    topButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(topButton.getAttribute('aria-pressed')).toBe('true');
    expect(lastRequestedUrl().searchParams.get('sort')).toBe('top');

    fixture.componentInstance.selectViewCategory('bug');
    await fixture.whenStable();
    const url = lastRequestedUrl();
    expect(url.searchParams.get('category')).toBe('bug');
    expect(url.searchParams.get('sort')).toBe('top');

    newestButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(newestButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not show stale counts or an empty result when loading fails', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.type-count')).not.toBeNull();

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Could not complete feedback request.'));
    fixture.componentInstance.selectViewCategory('bug');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Could not complete feedback request.');
    expect(element.querySelector('.type-count')).toBeNull();
    expect(element.querySelector('.empty')).toBeNull();
    expect(element.querySelector('.retry-load')?.textContent).toContain('Try again');
  });

  it('changes the writing guide with the selected type', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.switchTab('write');
    fixture.detectChanges();
    const guide: HTMLElement = fixture.nativeElement.querySelector('.guidance');
    expect(guide.textContent).toContain('Make your feedback actionable');
    expect(guide.querySelector('.example')).toBeNull();

    component.category.set('new_character_request');
    fixture.detectChanges();
    expect(guide.textContent).toContain('Poppy the Puffin');
    expect(guide.textContent).toContain('Card response:');

    component.category.set('bug');
    fixture.detectChanges();
    expect(guide.textContent).toContain('Help us reproduce the bug');
    expect(guide.querySelector('.example')).toBeNull();
  });

  it('submits without an agreement when the site asks for none', async () => {
    TestBed.inject(SiteConfigService).set({
      ...FALLBACK_SITE_CONFIG,
      legal: { ...FALLBACK_SITE_CONFIG.legal, requireAgreement: false },
    });
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.switchTab('write');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#agreement-accepted')).toBeNull();
    component.title.set('Voting bug');
    component.body.set('The vote button stopped responding after joining.');
    await component.submit();
    const sent = JSON.parse(vi.mocked(fetch).mock.lastCall?.[1]?.body as string) as object;
    expect(sent).not.toHaveProperty('agreementVersion');
    expect(sent).not.toHaveProperty('agreementAccepted');
  });

  it('validates and submits a new feedback entry', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.switchTab('write');
    component.agreementAccepted.set(true);
    component.title.set('short');
    component.body.set('too short');
    await component.submit();
    expect(component.error()).toContain('at least 20 characters');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    component.title.set('Voting bug');
    component.body.set('The vote button stopped responding after joining.');
    component.agreementAccepted.set(false);
    await component.submit();
    expect(component.error()).toContain('agree');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    component.agreementAccepted.set(true);
    fixture.detectChanges();
    const submit = vi.spyOn(component, 'submit');
    fixture.nativeElement.querySelector('form.feedback-form').dispatchEvent(new Event('submit'));
    expect(submit).toHaveBeenCalledTimes(1);
    await submit.mock.results[0]?.value;
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.lastCall?.[1]?.body as string)).toMatchObject({
      agreementVersion: FEEDBACK_AGREEMENT_VERSION,
      agreementAccepted: true,
    });
    expect(component.agreementAccepted()).toBe(false);
    expect(component.tab()).toBe('mine');
    expect(component.success()).toContain('waiting for review');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#mine-panel')?.textContent).toContain(
      'Waiting for review',
    );
  });

  it('keeps type-specific drafts and submits only the selected answers as plain text', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const form = composeForm(fixture);
    component.body.set('General feedback stays in its own draft.');
    component.category.set('bug');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const actual = element.querySelector<HTMLTextAreaElement>('#actual');
    if (!actual) throw new Error('Missing bug field');
    actual.value = 'The vote button does nothing.';
    actual.dispatchEvent(new Event('input'));
    form.setAnswer('expected', 'My vote should appear.');
    component.category.set('feature_request');
    fixture.detectChanges();
    form.setAnswer('problem', 'A different draft');
    component.category.set('bug');
    fixture.detectChanges();
    expect(form.answer('actual')).toBe('The vote button does nothing.');
    component.title.set('Vote button problem');
    component.agreementAccepted.set(true);
    await component.submit();
    expect(component.error()).toBe('');
    const requestBody = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === 'POST')?.[1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Missing submission');
    expect(JSON.parse(requestBody)).toEqual({
      category: 'bug',
      title: 'Vote button problem',
      body: 'What happened? \nThe vote button does nothing. \n \nWhat did you expect? \nMy vote should appear.',
      agreementVersion: FEEDBACK_AGREEMENT_VERSION,
      agreementAccepted: true,
    });
    expect(component.answers()).toEqual({});
    expect(component.body()).toBe('');
  });

  it('requires meaningful answers and enforces the combined limit including labels', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const form = composeForm(fixture);
    component.category.set('new_character_request');
    fixture.detectChanges();
    component.title.set('A dancing penguin');
    component.agreementAccepted.set(true);
    form.setAnswer('character', 'A cheerful penguin');
    form.setAnswer('action', '   ');
    await component.submit();
    expect(component.error()).toContain('Action and card reaction');
    form.setAnswer('action', 'a'.repeat(form.bodyMax - 18));
    await component.submit();
    expect(form.bodyLength()).toBeGreaterThan(form.bodyMax);
    expect(component.error()).toContain('2,000');
    form.setAnswer('action', 'See https://example.com');
    await component.submit();
    expect(component.error()).toContain('plain text');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(form.answer('character')).toBe('A cheerful penguin');
  });

  it('shows review status and the admin rejection reason only in the owner view', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    const own = {
      id: item.id,
      category: 'general',
      title: 'Private note',
      body: item.body,
      createdAt: item.createdAt,
      status: 'rejected',
      workflowStatus: 'new',
      resolutionReason: null,
      resolutionNote: null,
      duplicateOfId: null,
      rejectionReason: 'It may contain personal or confidential information.',
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            own,
            { ...own, id: bugItem.id, title: 'Silent rejection', rejectionReason: null },
            {
              ...own,
              id: '10000000-0000-4000-8000-000000000003',
              status: 'pending',
              rejectionReason: null,
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    fixture.componentInstance.switchTab('mine');
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const cards = element.querySelectorAll('#mine-panel .feedback-card');
    expect(cards[0]?.textContent).toContain('Not approved');
    expect(cards[0]?.textContent).toContain(
      'Reason: It may contain personal or confidential information.',
    );
    expect(cards[1]?.textContent).toContain('Not approved');
    expect(cards[1]?.textContent).not.toContain('Reason:');
    expect(cards[2]?.textContent).toContain('Waiting for review');
    expect(cards[2]?.textContent).toContain('Only you can see this until an admin approves it.');
    expect(element.querySelector('#mine-panel .vote-button')).toBeNull();
    expect(element.querySelector('#mine-panel [role="meter"]')).toBeNull();
    expect(element.querySelector('#mine-panel')?.textContent).not.toMatch(/\bAI\b/);
    fixture.componentInstance.switchTab('read');
    fixture.detectChanges();
    expect(element.textContent).not.toContain(
      'It may contain personal or confidential information.',
    );
  });

  it('lets visitors add and remove a reaction, but disables votes on their own feedback', async () => {
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const ownButton = element.querySelector<HTMLButtonElement>('.vote-button');
    expect(ownButton?.disabled).toBe(true);

    fixture.componentInstance.selectViewCategory('bug');
    await fixture.whenStable();
    fixture.detectChanges();
    const voteButton = element.querySelector<HTMLButtonElement>('.vote-button');
    if (!voteButton) throw new Error('Bug vote button is missing.');
    expect(voteButton.disabled).toBe(false);
    voteButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(voteButton.getAttribute('aria-pressed')).toBe('true');
    expect(voteButton.textContent).toContain('1');

    voteButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(voteButton.getAttribute('aria-pressed')).toBe('false');
    expect(voteButton.textContent).toContain('0');
    expect(vi.mocked(fetch).mock.calls.map(([, options]) => options?.method)).toContain('DELETE');
  });

  it('opens My submissions from the update dot, tags changed items and marks status news seen', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FeedbackComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ tab: 'mine' }) } },
        },
      ],
    }).compileComponents();
    const own = {
      id: item.id,
      category: 'general',
      title: 'Changed item',
      body: item.body,
      createdAt: item.createdAt,
      status: 'published',
      rejectionReason: null,
      workflowStatus: 'under_review',
      resolutionReason: null,
      resolutionNote: null,
      duplicateOfId: null,
      hasStatusUpdate: true,
    };
    const quiet = { ...own, id: bugItem.id, title: 'Quiet item', hasStatusUpdate: false };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.endsWith('/mine/seen')) return new Response(null, { status: 204 });
      if (url.endsWith('/mine/updates')) return new Response(JSON.stringify({ hasUpdates: false }));
      if (url.includes('/mine'))
        return new Response(JSON.stringify({ items: [own, quiet], nextCursor: null }));
      if (options?.method) throw new Error('Unexpected request.');
      return new Response(JSON.stringify({ items: [item], nextCursor: null, counts }));
    });
    const fixture = TestBed.createComponent(FeedbackComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.tab()).toBe('mine');
    const cards = fixture.nativeElement.querySelectorAll('#mine-panel .feedback-card');
    expect(cards[0]?.querySelector('.updated-tag')?.textContent).toContain('Updated');
    expect(cards[1]?.querySelector('.updated-tag')).toBeNull();
    const seen = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith('/api/feedback/mine/seen'));
    expect(seen?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(seen?.[1]?.body))).toEqual({ ids: [own.id] });
    expect(component.feedbackUpdates.hasUpdates()).toBe(false);
  });
});
