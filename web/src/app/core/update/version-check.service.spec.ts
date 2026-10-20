import { TestBed } from '@angular/core/testing';
import { VersionCheckService } from './version-check.service';
import { resolveApiUrl } from '../api/api-url';

describe('VersionCheckService versions', () => {
  let service: VersionCheckService;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    service = TestBed.inject(VersionCheckService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('reads the API version from the API root', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: '2026-10-01' })));
    await expect(service.getApiVersion()).resolves.toBe('2026-10-01');
    expect(fetchMock).toHaveBeenCalledWith(`${resolveApiUrl()}/api/version`);
  });

  it('labels an unreadable or unreachable API', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(service.getApiVersion()).resolves.toBe('Unknown');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ nope: true })));
    await expect(service.getApiVersion()).resolves.toBe('Unknown');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(service.getApiVersion()).resolves.toBe('Disconnected');
  });

  it('reports the development web build without fetching', async () => {
    await expect(service.getWebVersion()).resolves.toBe('Development');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
