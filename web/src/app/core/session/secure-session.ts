import { requestVisitorSession } from './visitor-session';

const REQUEST_TIMEOUT_MS = 10_000;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 10_000;

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** Establishes the HttpOnly session before connecting; cancellation owns requests and retries. */
export async function initializeSecureSession(
  apiUrl: string,
  connect: () => void,
  signal: AbortSignal,
): Promise<void> {
  let retryDelay = INITIAL_RETRY_MS;
  let failureLogged = false;
  while (!signal.aborted) {
    const requestController = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await requestVisitorSession(apiUrl, {
        signal: AbortSignal.any([signal, requestController.signal]),
      });
      if (!response.ok) throw new Error(`Session initialization returned HTTP ${response.status}`);
      if (!signal.aborted) connect();
      return;
    } catch (error) {
      if (signal.aborted) return;
      if (!failureLogged) {
        console.warn('Failed to initialize secure session cookie; retrying', error);
        failureLogged = true;
      }
    } finally {
      clearTimeout(timeout);
    }
    await waitForRetry(retryDelay, signal);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }
}
