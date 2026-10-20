import { describe, expect, it } from 'vitest';
import { apiErrorMessage, readJsonResponse } from './api-request';

describe('apiErrorMessage', () => {
  it('returns only a string message', () => {
    expect(apiErrorMessage({ message: 'No.' })).toBe('No.');
    expect(apiErrorMessage({ message: 4 })).toBeNull();
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage('message')).toBeNull();
  });
});

describe('readJsonResponse', () => {
  it('returns the body of an ok response', async () => {
    await expect(readJsonResponse(new Response('{"a":1}'), 'Failed.')).resolves.toEqual({ a: 1 });
  });

  it('throws the API message, or the fallback, for an error response', async () => {
    const withMessage = new Response('{"message":"Denied."}', { status: 403 });
    await expect(readJsonResponse(withMessage, 'Failed.')).rejects.toThrow('Denied.');
    const without = new Response('{}', { status: 500 });
    await expect(readJsonResponse(without, 'Failed.')).rejects.toThrow('Failed.');
  });
});
