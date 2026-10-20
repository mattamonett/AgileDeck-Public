import { z } from 'zod';

export enum Theme {
  GARDEN = 'default',
  SPACE = 'space',
  RETRO = 'retro',
  VEGAS = 'vegas',
  GRAVEYARD = 'graveyard',
  HARVEST = 'harvest',
  CABIN = 'cabin',
}

export interface ThemeDefinition {
  id: string;
  name: string;
  icon: string;
}

export const THEMES = [
  { id: Theme.GARDEN, name: 'Moonlit Garden', icon: '🌑' },
  { id: Theme.SPACE, name: 'Deep Space', icon: '🌌' },
  { id: Theme.RETRO, name: 'Retro CRT', icon: '📟' },
  { id: Theme.VEGAS, name: 'Las Vegas', icon: '🎰' },
  { id: Theme.GRAVEYARD, name: 'Graveyard Shift', icon: '🪦' },
  { id: Theme.HARVEST, name: 'Harvest Table', icon: '🥧' },
  { id: Theme.CABIN, name: 'Fireside Cabin', icon: '🔥' },
] as const satisfies readonly ThemeDefinition[];

export const UpdateThemeSchema = z.object({
  theme: z.enum(Theme),
});
export type UpdateThemePayload = z.input<typeof UpdateThemeSchema>;
