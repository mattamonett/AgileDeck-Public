import { PROJECTILE_STORAGE_KEY } from '@core/storage/storage-keys';
import {
  DEFAULT_PROJECTILE,
  loadProjectilePreference,
  saveProjectilePreference,
} from './projectile-preference';

describe('projectile preference', () => {
  afterEach(() => localStorage.clear());

  it('falls back to the default when nothing or an unknown throwable is stored', () => {
    expect(loadProjectilePreference()).toBe(DEFAULT_PROJECTILE);
    localStorage.setItem(PROJECTILE_STORAGE_KEY, 'not-a-throwable');
    expect(loadProjectilePreference()).toBe(DEFAULT_PROJECTILE);
  });

  it('round-trips a saved throwable', () => {
    saveProjectilePreference('🍅');
    expect(loadProjectilePreference()).toBe('🍅');
  });
});
