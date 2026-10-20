import { initializeSecureSession } from './secure-session';

describe('secure session lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects only after an authenticated successful initialization response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const connect = vi.fn();
    await initializeSecureSession('http://api.test', connect, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/init',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
    expect(connect).toHaveBeenCalledOnce();
  });

  it('retries failed initialization and cancels a queued retry when destroyed', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const abort = new AbortController();
    const connect = vi.fn();
    const initializing = initializeSecureSession('http://api.test', connect, abort.signal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    abort.abort();
    await initializing;
    expect(vi.getTimerCount()).toBe(0);
    expect(connect).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request and never connects after destruction', async () => {
    const abort = new AbortController();
    const connect = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const initializing = initializeSecureSession('http://api.test', connect, abort.signal);
    abort.abort();
    await initializing;
    expect(connect).not.toHaveBeenCalled();
  });
});
