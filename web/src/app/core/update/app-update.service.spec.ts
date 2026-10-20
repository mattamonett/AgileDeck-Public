import { TestBed } from '@angular/core/testing';
import { SwUpdate, type UnrecoverableStateEvent, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let swUpdate: {
    isEnabled: boolean;
    checkForUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    activateUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    versionUpdates: Subject<VersionEvent>;
    unrecoverable: Subject<UnrecoverableStateEvent>;
  };
  let reloadPage: ReturnType<typeof vi.spyOn>;

  function createService(): AppUpdateService {
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: swUpdate }] });
    return TestBed.inject(AppUpdateService);
  }

  /** Lets the update check the service starts with finish. */
  async function createSettledService(): Promise<AppUpdateService> {
    const service = createService();
    await new Promise((resolve) => setTimeout(resolve));
    return service;
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    swUpdate = {
      isEnabled: true,
      checkForUpdate: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
      activateUpdate: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
      versionUpdates: new Subject<VersionEvent>(),
      unrecoverable: new Subject<UnrecoverableStateEvent>(),
    };
    reloadPage = vi.spyOn(AppUpdateService.prototype, 'reloadPage').mockReturnValue(undefined);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reloads into a build deployed since this page was cached as soon as it starts', async () => {
    swUpdate.checkForUpdate.mockResolvedValue(true);
    createService();
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
  });

  it('stays on the current page when no newer build exists', async () => {
    const service = createService();
    await expect(service.reloadIfUpdateAvailable()).resolves.toBe(false);
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('reloads for a build the service worker already downloaded', async () => {
    const service = createService();
    await expect(service.reloadIfUpdateAvailable()).resolves.toBe(false);
    swUpdate.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
    await expect(service.reloadIfUpdateAvailable()).resolves.toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('does not reload automatically twice in quick succession', async () => {
    const service = await createSettledService();
    swUpdate.checkForUpdate.mockResolvedValue(true);
    await expect(service.reloadIfUpdateAvailable()).resolves.toBe(true);
    await expect(service.reloadIfUpdateAvailable()).resolves.toBe(false);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('activates the downloaded build before reloading when asked to update', async () => {
    const service = await createSettledService();
    swUpdate.checkForUpdate.mockResolvedValue(true);
    await service.reloadToLatest();
    expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('still reloads when asked to update without a service worker update', async () => {
    const service = createService();
    await service.reloadToLatest();
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('reloads when the cached build can no longer run', () => {
    createService();
    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing files' });
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
