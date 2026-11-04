import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'web/dist', 'artifacts', 'scripts/spike', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
    },
  },
  {
    // The pure core: no Node built-ins, no clock, no randomness. Same code runs in the browser preview.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'fs', 'path', 'child_process', '@napi-rs/*', 'node-llama-cpp', 'kokoro-js'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a seeded Rng from core/rng.ts' },
        { object: 'Date', property: 'now', message: 'Inject a clock' },
      ],
    },
  },
  {
    // Secrets must never reach a console.
    files: ['src/node/keys/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
);
