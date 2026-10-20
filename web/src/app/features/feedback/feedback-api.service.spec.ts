import { TestBed } from '@angular/core/testing';
import { FeedbackApiService, responseMessage } from './feedback-api.service';

const voteState = {
  voteCounts: {
    agree: 1,
    disagree: 0,
    seen_too: 0,
    would_use: 0,
    not_for_me: 0,
    would_throw: 0,
  },
  userVote: 'agree',
};

describe('FeedbackApiService', () => {
  let api: FeedbackApiService;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    api = TestBed.inject(FeedbackApiService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function lastRequest(): { url: URL; init: RequestInit | undefined } {
    const [input, init] = fetchMock.mock.lastCall ?? [];
    if (typeof input !== 'string') throw new Error('Expected a URL string.');
    return { url: new URL(input), init };
  }

  it('lists feedback with the board filters and the visitor cookie', async () => {
    const counts = { general: 0, bug: 0, feature_request: 0, new_character_request: 0 };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null, counts })),
    );
    await expect(
      api.list({ category: 'bug', sort: 'top', includeClosed: true, cursor: 'next' }),
    ).resolves.toEqual({ items: [], nextCursor: null, counts });
    const { url, init } = lastRequest();
    expect(url.pathname).toBe('/api/feedback');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: 'bug',
      sort: 'top',
      includeClosed: 'true',
      cursor: 'next',
    });
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store' });
  });

  it('lists own submissions with an encoded cursor', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null })));
    await api.listOwn('a b');
    expect(lastRequest().url.pathname).toBe('/api/feedback/mine');
    expect(lastRequest().url.searchParams.get('cursor')).toBe('a b');
  });

  it('puts a reaction and deletes the vote for a null reaction', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(voteState)));
    await expect(api.vote('id-1', 'agree')).resolves.toEqual(voteState);
    expect(lastRequest().url.pathname).toBe('/api/feedback/id-1/vote');
    expect(lastRequest().init).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ reaction: 'agree' }),
    });
    await api.vote('id-1', null);
    expect(lastRequest().init?.method).toBe('DELETE');
    expect(lastRequest().init?.body).toBeUndefined();
  });

  it('marks own status updates as seen without checking the response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(api.markOwnSeen(['id-1'])).resolves.toBeUndefined();
    expect(lastRequest().url.pathname).toBe('/api/feedback/mine/seen');
    expect(lastRequest().init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ ids: ['id-1'] }),
    });
  });

  it('surfaces the API message for failed requests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Slow down.' }), { status: 429 }),
    );
    await expect(api.vote('id-1', 'agree')).rejects.toThrow('Slow down.');
    expect(lastRequest().init).toMatchObject({ method: 'PUT', credentials: 'include' });
  });

  it('rejects responses that do not match the contract', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: 'nope' })));
    await expect(api.listOwn(null)).rejects.toThrow();
  });
});

describe('responseMessage', () => {
  it('falls back to a generic message without a JSON message', async () => {
    const generic = 'The request could not be completed. Please try again.';
    await expect(responseMessage(new Response('not json', { status: 500 }))).resolves.toBe(generic);
    await expect(responseMessage(new Response(JSON.stringify({ message: 4 })))).resolves.toBe(
      generic,
    );
    await expect(responseMessage(new Response(JSON.stringify({ message: 'No.' })))).resolves.toBe(
      'No.',
    );
  });
});
