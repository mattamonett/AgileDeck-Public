// @ts-check
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import fs from 'node:fs';
import tseslint from 'typescript-eslint';
import { ignores, typescript } from '../eslint.config.base.mjs';

const FEATURES = fs
  .readdirSync(`${import.meta.dirname}/src/app/features`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const DEEP_RELATIVE = {
  group: ['../../../*'],
  message: 'Use the @core, @shared or @features alias instead of a deep relative import.',
};

/** Imports a file may not use: deep relative paths, plus any layers it must stay independent of. */
function restrictedImports(...patterns) {
  return { 'no-restricted-imports': ['error', { patterns: [DEEP_RELATIVE, ...patterns] }] };
}

export default defineConfig([
  ignores,
  {
    files: ['**/*.ts'],
    extends: [typescript, tseslint.configs.stylistic, angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: restrictedImports(),
  },
  {
    files: ['src/app/core/**/*.ts', 'src/app/shared/**/*.ts'],
    rules: restrictedImports({
      group: ['@features/*'],
      message: 'Core and shared code must not depend on a feature.',
    }),
  },
  ...FEATURES.map((feature) => ({
    files: [`src/app/features/${feature}/**/*.ts`],
    rules: restrictedImports({
      group: ['@features/*', `!@features/${feature}`, `!@features/${feature}/*`],
      message: 'Features must not import other features; move shared code to @shared or @core.',
    }),
  })),
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
]);
