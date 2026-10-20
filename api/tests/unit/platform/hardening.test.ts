import express from 'express';
import type { AddressInfo } from 'node:net';
import { apiSecurityHeaders, handleApiError } from '../../../src/platform/http/hardening';

class ClientError extends Error {
  readonly status = 409;
}

async function withServer(run: (url: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(apiSecurityHeaders);
  app.get('/client', () => {
    throw new ClientError('Refresh before continuing.');
  });
  app.get('/server', () => {
    throw new Error('SQLITE_BUSY: database is locked at /app/api/data');
  });
  app.use(handleApiError);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('API HTTP hardening', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides internal error details and stack traces', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/server`);
      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('json');
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        message: 'An unexpected error occurred.',
      });
      expect(body).not.toContain('SQLITE');
    });
  });

  it('reports client errors with their own status and message', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/client`);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        message: 'Refresh before continuing.',
      });
    });
  });

  it('sends restrictive security headers', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/client`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    });
  });
});
