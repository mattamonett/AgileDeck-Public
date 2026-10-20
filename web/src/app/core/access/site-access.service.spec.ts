import { TestBed } from '@angular/core/testing';
import type { PasswordProtection } from '@poker/shared';
import { SiteAccessService } from './site-access.service';
import { FALLBACK_SITE_CONFIG, SiteConfigService } from '../config/site-config.service';

function protect(passwordProtects: PasswordProtection): SiteAccessService {
  TestBed.inject(SiteConfigService).set({ ...FALLBACK_SITE_CONFIG, access: { passwordProtects } });
  return TestBed.inject(SiteAccessService);
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('SiteAccessService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is unlocked without asking when nothing is protected', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const access = protect('nothing');
    await access.refresh();
    expect(access.unlocked()).toBe(true);
    expect(access.siteLocked()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mirrors the server's answer once the settings ask for a password", async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reply(200, { unlocked: true }));
    const access = protect('everything');
    expect(access.siteLocked()).toBe(true);
    await access.refresh();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/access$/),
      expect.anything(),
    );
    expect(access.unlocked()).toBe(true);
    expect(access.siteLocked()).toBe(false);
  });

  it('stays locked when the status cannot be read', async () => {
    const access = protect('room-creation');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(500, {}));
    await access.refresh();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(200, { unexpected: 1 }));
    await access.refresh();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await access.refresh();
    expect(access.unlocked()).toBe(false);
    expect(access.siteLocked()).toBe(false);
  });

  it('unlocks after the server accepts the password', async () => {
    const access = protect('everything');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, { status: 'ok' }))
      .mockResolvedValueOnce(reply(200, { unlocked: true }));
    expect(await access.unlock('secret password')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/init$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ password: 'secret password' }),
    });
    expect(access.siteLocked()).toBe(false);
  });

  it("shows the server's reason when the password is refused", async () => {
    const access = protect('everything');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, {}))
      .mockResolvedValueOnce(reply(401, { message: 'That password is not right.' }))
      .mockResolvedValueOnce(reply(200, {}))
      .mockResolvedValueOnce(new Response('oops', { status: 502 }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await access.unlock('nope')).toEqual({
      ok: false,
      message: 'That password is not right.',
    });
    expect(await access.unlock('nope')).toEqual({
      ok: false,
      message: 'That did not work. Please try again.',
    });
    expect(await access.unlock('nope')).toEqual({
      ok: false,
      message: 'Could not reach the site. Please try again.',
    });
    expect(access.siteLocked()).toBe(true);
  });
});
