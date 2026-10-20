import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Build output and tooling caches, ignored by every workspace. */
export const ignores = {
  ignores: ['**/dist/**', '**/coverage/**', '**/out-tsc/**', '**/.angular/**'],
};

/** The TypeScript rules every workspace shares. Prettier owns formatting. */
export const typescript = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettierConfig,
];
