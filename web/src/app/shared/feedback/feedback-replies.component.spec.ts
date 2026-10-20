import { TestBed } from '@angular/core/testing';
import { FeedbackRepliesComponent } from './feedback-replies.component';

const id = '10000000-0000-4000-8000-000000000001';
const reply = {
  id: '10000000-0000-4000-8000-000000000002',
  feedbackId: id,
  author: 'admin',
  body: '<img src=x onerror=alert(1)>',
  createdAt: '2026-09-30T00:00:00.000Z',
  status: 'published',
  rejectionReason: null,
  isUnread: true,
};

describe('FeedbackRepliesComponent', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/read')) return new Response(JSON.stringify({ hasUnread: false }));
        if (options?.method === 'POST')
          return new Response(
            JSON.stringify({
              ...reply,
              author: 'author',
              body: 'Thanks!',
              status: 'pending',
              isUnread: false,
            }),
          );
        return new Response(
          JSON.stringify({
            totalCount: 7,
            items: [reply],
            nextCursor: null,
            canReply: true,
            hasUnread: true,
          }),
        );
      }),
    );
    await TestBed.configureTestingModule({
      imports: [FeedbackRepliesComponent],
    }).compileComponents();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function create(admin = false) {
    const fixture = TestBed.createComponent(FeedbackRepliesComponent);
    fixture.componentRef.setInput('feedbackId', id);
    fixture.componentRef.setInput('baseUrl', admin ? '/api/admin' : 'http://localhost:3300/api');
    fixture.componentRef.setInput('canReply', true);
    fixture.componentRef.setInput('replyCount', 6);
    if (admin) fixture.componentRef.setInput('admin', true);
    return fixture;
  }

  it('loads on demand, renders text safely, and sends read receipts only for displayed unread replies', async () => {
    const fixture = create();
    await fixture.whenStable();
    expect(fetch).not.toHaveBeenCalled();
    const initialElement: HTMLElement = fixture.nativeElement;
    expect(initialElement.querySelector('.reply-count')?.textContent?.trim()).toBe('6');
    const changed = vi.fn();
    fixture.componentInstance.unreadChange.subscribe(changed);
    await fixture.componentInstance.toggle();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Admin');
    expect(element.querySelector('.reply-count')?.textContent?.trim()).toBe('7');
    expect(element.textContent).toContain(reply.body);
    expect(element.querySelector('img')).toBeNull();
    expect(changed.mock.calls).toEqual([[true], [false]]);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ ids: [reply.id] }),
    });
  });

  it('hides the replies toggle when there are no visible replies', async () => {
    const fixture = create();
    fixture.componentRef.setInput('replyCount', 0);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.replies-toggle')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts validated body only and leaves replies without human statuses', async () => {
    const fixture = create();
    await fixture.whenStable();
    await fixture.componentInstance.toggle();
    fixture.componentInstance.body.set('https://example.com');
    await fixture.componentInstance.send();
    expect(fixture.componentInstance.error()).toContain('plain text');
    fixture.componentInstance.body.set('  Thanks!  ');
    await fixture.componentInstance.send();
    const post = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, options]) =>
          typeof url === 'string' && url.endsWith('/replies') && options?.method === 'POST',
      );
    expect(post?.[1]?.body).toBe(JSON.stringify({ body: 'Thanks!' }));
    expect(fixture.componentInstance.body()).toBe('');
    expect(fixture.componentInstance.success()).toContain(
      'Only you and the admin can see it until it is approved.',
    );
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('select')).toBeNull();
  });

  it('shows waiting and not-approved replies with the admin reason, without retry or AI details', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCount: 3,
          items: [
            {
              ...reply,
              id: '10000000-0000-4000-8000-000000000003',
              author: 'author',
              status: 'pending',
              isUnread: false,
            },
            {
              ...reply,
              id: '10000000-0000-4000-8000-000000000004',
              author: 'author',
              status: 'rejected',
              rejectionReason: 'Please keep replies on topic.',
              isUnread: false,
            },
            {
              ...reply,
              id: '10000000-0000-4000-8000-000000000005',
              author: 'author',
              status: 'rejected',
              isUnread: false,
            },
          ],
          nextCursor: null,
          canReply: true,
          hasUnread: false,
        }),
      ),
    );
    const fixture = create();
    await fixture.whenStable();
    await fixture.componentInstance.toggle();
    fixture.detectChanges();
    const replies = (fixture.nativeElement as HTMLElement).querySelectorAll('article');
    expect(replies[0]?.textContent).toContain('Waiting for review · Private');
    expect(replies[1]?.textContent).toContain('Not approved · Private');
    expect(replies[1]?.textContent).toContain('Reason: Please keep replies on topic.');
    expect(replies[2]?.textContent).toContain('Not approved · Private');
    expect(replies[2]?.textContent).not.toContain('Reason:');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/\bAI\b|safety check|Try check again/);
    expect(text).toContain('An admin reviews each reply before others can see it.');
  });

  it('automatically opens admin conversations with the admin cookie and hides the composer for readers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ ...reply, isUnread: false }],
          nextCursor: null,
          canReply: false,
          hasUnread: false,
        }),
      ),
    );
    const fixture = create(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('textarea')).toBeNull();
  });
});
