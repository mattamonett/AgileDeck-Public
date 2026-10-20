export const PLAYER_SEX_STORAGE_KEY = 'agiledeck_player_sex_v1';
export const USER_NAME_STORAGE_KEY = 'agiledeck_username_v2';
export const SITE_AGREEMENT_STORAGE_KEY = 'agiledeck_site_agreement_version';
export const PROJECTILE_STORAGE_KEY = 'agiledeck_projectile_v1';
export const NUDGE_SOUND_STORAGE_KEY = 'agiledeck_nudge_sound_v1';
/** Session storage: when this tab last reloaded itself to apply an update. */
export const AUTO_RELOAD_STORAGE_KEY = 'agile-deck-auto-reload-at';
const LEGACY_USER_NAME_STORAGE_KEYS = ['poker_username'];

const LEGACY_CREATOR_SESSION_KEY_PREFIXES = ['is_creator_'];

export function clearLegacyClientIdentity(roomId?: string): void {
  for (const key of LEGACY_USER_NAME_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }

  if (!roomId) return;

  for (const prefix of LEGACY_CREATOR_SESSION_KEY_PREFIXES) {
    sessionStorage.removeItem(`${prefix}${roomId}`);
  }
}
