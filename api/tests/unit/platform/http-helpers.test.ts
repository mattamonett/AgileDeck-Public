import type { Request, Response } from 'express';
import {
  requireAllowedOrigin,
  requireVisitor,
  respondError,
} from '../../../src/platform/http/helpers';
import { responseLocal } from '../../../src/platform/http/response-local';
import { VISITOR_COOKIE_NAME } from '../../../src/platform/http/visitor-session';

class KnownError extends Error {}

function fakeResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  // Only status() and json() are used by the helpers under test.
  return { res: res as unknown as Response, sent };
}

function fakeRequest(cookies: Record<string, string> | undefined): Request {
  return { cookies } as unknown as Request;
}

describe('route http helpers', () => {
  const visitorId = '123e4567-e89b-42d3-a456-426614174000';
  const responder = {
    knownStatus: (error: unknown) => (error instanceof KnownError ? 418 : null),
    logPrefix: 'Thing request failed:',
    fallbackMessage: 'Could not complete the thing request.',
  };

  beforeEach(() => {
    delete process.env.COOKIE_SIGNING_SECRET;
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
  });

  it('returns the visitor from a valid cookie without responding', () => {
    const { res, sent } = fakeResponse();
    expect(requireVisitor(fakeRequest({ [VISITOR_COOKIE_NAME]: visitorId }), res)).toBe(visitorId);
    expect(sent).toEqual({});
  });

  it('responds 401 with the default or custom message when the cookie is missing', () => {
    const first = fakeResponse();
    expect(requireVisitor(fakeRequest(undefined), first.res)).toBeNull();
    expect(first.sent).toEqual({
      status: 401,
      body: { message: 'A valid session is required.' },
    });
    const second = fakeResponse();
    expect(requireVisitor(fakeRequest({}), second.res, 'Join this room first.')).toBeNull();
    expect(second.sent.body).toEqual({ message: 'Join this room first.' });
  });

  it('sends known errors with their status and hides unexpected ones', () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    const known = fakeResponse();
    respondError(known.res, new KnownError('Visible reason.'), responder);
    expect(known.sent).toEqual({
      status: 418,
      body: { message: 'Visible reason.' },
    });
    expect(errorLog).not.toHaveBeenCalled();

    const unknown = fakeResponse();
    const failure = new Error('database path leaked');
    respondError(unknown.res, failure, responder);
    expect(unknown.sent).toEqual({
      status: 500,
      body: { message: 'Could not complete the thing request.' },
    });
    expect(errorLog).toHaveBeenCalledWith('Thing request failed:', failure);
    errorLog.mockRestore();
  });

  it('allows only listed origins for browser mutations', () => {
    const allowed = (origin: string) => origin === 'https://poker.example';
    const withOrigin = (origin?: string) => ({ get: () => origin }) as unknown as Request;

    const ok = fakeResponse();
    expect(requireAllowedOrigin(withOrigin('https://poker.example'), ok.res, allowed)).toBe(true);
    expect(ok.sent).toEqual({});

    for (const origin of ['https://evil.example', undefined]) {
      const refused = fakeResponse();
      expect(requireAllowedOrigin(withOrigin(origin), refused.res, allowed)).toBe(false);
      expect(refused.sent).toEqual({
        status: 403,
        body: { message: 'Origin not allowed.' },
      });
    }
  });

  it('keeps response locals per response and fails when one is missing', () => {
    const local = responseLocal<string>(() => new KnownError('missing'));
    const first = fakeResponse().res;
    const second = fakeResponse().res;

    local.set(first, '');
    expect(local.get(first)).toBe('');
    expect(() => local.get(second)).toThrow(KnownError);
  });
});
