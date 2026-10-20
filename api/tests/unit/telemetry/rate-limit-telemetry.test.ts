import { createServer } from 'node:http';
import express from 'express';
import {
  RateLimitRecorder,
  observeHttpRateLimits,
  rateLimitRecorder,
  recordCookieRateLimitHit,
} from '../../../src/modules/telemetry/rate-limit-telemetry';
import {
  encodeVisitorCookie,
  VISITOR_COOKIE_NAME,
} from '../../../src/platform/http/visitor-session';
import type { RateLimitBatchEntry } from '../../../src/modules/telemetry/rate-limit-stats.repository';

it('coalesces hits into daily batches without doing database work on the rejection path', async () => {
  const persist = jest.fn<Promise<void>, [readonly RateLimitBatchEntry[]]>().mockResolvedValue();
  const recorder = new RateLimitRecorder(persist);
  for (let index = 0; index < 1000; index++) recorder.record('known');
  recorder.record(null);
  expect(persist).not.toHaveBeenCalled();
  await recorder.flush();
  expect(persist.mock.calls[0]?.[0]).toEqual([
    expect.objectContaining({ visitorId: 'known', count: 1000 }),
  ]);
});

it('bounds memory and batches, retries failures, and does not run overlapping flushes', async () => {
  let release: () => void = () => {
    throw new Error('Missing flush');
  };
  const persist = jest
    .fn<Promise<void>, [readonly RateLimitBatchEntry[]]>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue();
  const recorder = new RateLimitRecorder(persist);
  for (let index = 0; index < 2100; index++) recorder.record('visitor-' + index);
  await expect(recorder.flush()).rejects.toThrow('offline');
  const pending = recorder.flush();
  await recorder.flush();
  expect(persist).toHaveBeenCalledTimes(2);
  release();
  await pending;
  for (let index = 0; index < 20; index++) await recorder.flush();
  const successful = persist.mock.calls.slice(1).flatMap(([batch]) => batch);
  expect(successful.reduce((sum, entry) => sum + entry.count, 0)).toBe(2000);
  expect(persist.mock.calls.every(([batch]) => batch.length <= 100)).toBe(true);
});

it('attributes HTTP 429 responses once using only the signed cookie, and ignores forged identities', async () => {
  const previousSecret = process.env.COOKIE_SIGNING_SECRET;
  const previousMode = process.env.NODE_ENV;
  process.env.COOKIE_SIGNING_SECRET = 'telemetry-test-secret-0123456789abcdef';
  process.env.NODE_ENV = 'production';
  const spy = jest.spyOn(rateLimitRecorder, 'record').mockImplementation(() => undefined);
  const visitor = '10000000-0000-4000-8000-000000000001';
  const app = express();
  app.use(observeHttpRateLimits);
  app.get('/limited', (_req, res) => res.status(429).json({ message: 'Limited' }));
  app.get('/allowed', (_req, res) => res.json({ status: 'ok' }));
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {
      Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`,
    };
    await fetch(base + '/allowed', { headers });
    expect(spy).not.toHaveBeenCalled();
    await fetch(base + '/limited', { headers });
    expect(spy).toHaveBeenCalledWith(visitor);
    spy.mockClear();
    recordCookieRateLimitHit(`${VISITOR_COOKIE_NAME}=${visitor}`);
    recordCookieRateLimitHit(`${VISITOR_COOKIE_NAME}=forged`);
    expect(spy.mock.calls.every(([identity]) => identity === null)).toBe(true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    spy.mockRestore();
    if (previousSecret === undefined) delete process.env.COOKIE_SIGNING_SECRET;
    else process.env.COOKIE_SIGNING_SECRET = previousSecret;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});
