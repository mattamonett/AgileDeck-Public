import { TestBed } from '@angular/core/testing';
import type { AdminPendingReview } from '@poker/shared';
import { PendingReviewComponent } from './pending-review.component';
import { resolveApiUrl } from '@core/api/api-url';

const API = resolveApiUrl();

const feedbackId = '10000000-0000-4000-8000-000000000001';
const replyId = '20000000-0000-4000-8000-000000000001';
const pendingItem = {
  id: feedbackId,
  category: 'bug',
  title: '<img src=x> Voting bug',
  body: 'A sufficiently detailed report.',
  createdAt: '2026-10-01T00:00:00.000Z',
  status: 'pending',
  rejectionReason: null,
  hasUnreadReplies: false,
  hasStatusUpdate: false,
  replyCount: 0,
  workflowStatus: 'new',
  resolutionReason: null,
  resolutionNote: null,
  duplicateOfId: null,
} as const;
const pendingReply = {
  id: replyId,
  feedbackId,
  author: 'author',
  body: 'It also happens on mobile.',
  createdAt: '2026-10-02T00:00:00.000Z',
  status: 'pending',
  rejectionReason: null,
  isUnread: false,
} as const;
const queue: AdminPendingReview = {
  feedback: [pendingItem],
  feedbackCount: 1,
  replies: [
    {
      reply: pendingReply,
      feedback: { id: feedbackId, category: 'bug', title: 'Voting bug', status: 'published' },
    },
  ],
  replyCount: 1,
};
const emptyQueue: AdminPendingReview = {
  feedback: [],
  feedbackCount: 0,
  replies: [],
  replyCount: 0,
};

describe('PendingReviewComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function create(handler: (url: string, init?: RequestInit) => Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => handler(url, init)),
    );
    await TestBed.configureTestingModule({ imports: [PendingReviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PendingReviewComponent);
    const counts: number[] = [];
    let reviewed = 0;
    fixture.componentInstance.pendingCount.subscribe((count) => counts.push(count));
    fixture.componentInstance.reviewed.subscribe(() => reviewed++);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return { fixture, counts, reviewed: () => reviewed };
  }

  function posts() {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([url, init]) => ({ url: String(url), init }));
  }

  it('lists pending feedback and replies as text and reports the queue size', async () => {
    const { fixture, counts } = await create(() => new Response(JSON.stringify(queue)));
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Feedback (1)');
    expect(element.textContent).toContain('Replies (1)');
    expect(element.textContent).toContain(pendingItem.title);
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('It also happens on mobile.');
    expect(element.textContent).toContain('Voting bug');
    expect(counts).toEqual([2]);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(API + '/api/admin/pending');
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store' });
  });

  it('approves feedback, notifies the parent, and reloads the queue', async () => {
    let approved = false;
    const { fixture, counts, reviewed } = await create((url, init) => {
      if (init?.method === 'POST') {
        approved = true;
        return new Response(JSON.stringify({ ...pendingItem, status: 'published' }));
      }
      return new Response(JSON.stringify(approved ? emptyQueue : queue));
    });
    const approve = fixture.nativeElement.querySelector(
      'article app-review-decision button',
    ) as HTMLButtonElement | null;
    expect(approve?.textContent).toContain('Approve');
    approve?.click();
    await vi.waitFor(() => expect(counts).toEqual([2, 0]));
    const [post] = posts();
    expect(post?.url).toBe(API + '/api/admin/feedback/' + feedbackId + '/approve');
    expect(post?.init?.body).toBeUndefined();
    expect(reviewed()).toBe(1);
    expect(fixture.componentInstance.success()).toBe('Feedback approved and published.');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No feedback is waiting for review.');
  });

  it('rejects a reply with a trimmed reason and validates the reason before sending', async () => {
    const { fixture, reviewed } = await create((_url, init) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              ...pendingReply,
              status: 'rejected',
              rejectionReason: 'Off topic.',
            }),
          )
        : new Response(JSON.stringify(queue)),
    );
    const component = fixture.componentInstance;
    await component.reject('replies', replyId, 'See https://example.com');
    expect(component.error()).toContain('plain text');
    expect(posts()).toHaveLength(0);
    await component.reject('replies', replyId, '  Off topic.  ');
    const [post] = posts();
    expect(post?.url).toBe(API + '/api/admin/replies/' + replyId + '/reject');
    expect(post?.init?.body).toBe(JSON.stringify({ reason: 'Off topic.' }));
    expect(new Headers(post?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(component.success()).toBe('Reply rejected.');
    expect(reviewed()).toBe(1);
  });

  it('sends an empty reason for a silent rejection and shows server conflicts', async () => {
    const { fixture, reviewed } = await create((_url, init) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ message: 'This was already reviewed.' }), {
            status: 409,
          })
        : new Response(JSON.stringify(queue)),
    );
    const component = fixture.componentInstance;
    await component.reject('feedback', feedbackId, '   ');
    expect(posts()[0]?.init?.body).toBe(JSON.stringify({ reason: '' }));
    expect(component.error()).toBe('This was already reviewed.');
    expect(reviewed()).toBe(0);
    expect(component.busyId()).toBeNull();
  });
});
