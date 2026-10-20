import { z } from 'zod';

export enum Theme {
  GARDEN = 'default',
  SPACE = 'space',
  RETRO = 'retro',
  VEGAS = 'vegas',
  GRAVEYARD = 'graveyard',
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
] as const satisfies readonly ThemeDefinition[];

export const UpdateThemeSchema = z.object({
  theme: z.enum(Theme),
});
export type UpdateThemePayload = z.input<typeof UpdateThemeSchema>;
