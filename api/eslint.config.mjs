import globals from 'globals';
import tseslint from 'typescript-eslint';
import { ignores, typescript } from '../eslint.config.base.mjs';

export default tseslint.config(
  ignores,
  ...typescript,
  {
    languageOptions: { globals: globals.node },
  },
  {
    // Application code logs through platform/logger.ts, the one console user.
    files: ['src/**/*.ts'],
    ignores: ['src/platform/logger.ts'],
    rules: { 'no-console': 'error' },
  },
);
