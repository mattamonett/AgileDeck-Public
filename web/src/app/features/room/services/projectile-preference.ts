import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import { PROJECTILE_STORAGE_KEY } from '@core/storage/storage-keys';

/** The throwable a visitor starts with, and falls back to when their choice is not allowed. */
export const DEFAULT_PROJECTILE = '📄';

/** The visitor's saved throwable, or the default when nothing valid is stored. */
export function loadProjectilePreference(): string {
  const stored = localStorage.getItem(PROJECTILE_STORAGE_KEY);
  return stored && VALID_INTERACTION_CHARACTERS.has(stored) ? stored : DEFAULT_PROJECTILE;
}

export function saveProjectilePreference(projectile: string): void {
  localStorage.setItem(PROJECTILE_STORAGE_KEY, projectile);
}
