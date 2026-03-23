import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import security from 'eslint-plugin-security';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      'dist/',
      'out/',
      'build-resources/',
      'coverage/',
      '*.config.*',
    ],
  },

  // ── Base recommended rules ────────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // ── All TS/TSX files: React + complexity + import sorting ─────────
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // React recommended rules (manually included since flat config)
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      // JSX runtime — no need to import React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // ── Complexity / size guards ──────────────────────────────────
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }], // TODO(v1.1): ratchet back to 40 after function-splitting work
      'complexity': ['error', 10],
      'max-lines': ['error', { max: 700, skipBlankLines: true, skipComments: true }], // TODO(v1.1): ratchet back to 300 after file-splitting work
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // ── Import sorting (deterministic, diff-friendly) ─────────────
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },

  // ── Security rules for Node.js code (main + preload only) ────────
  {
    files: ['src/main/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}'],
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      // Upgrade advisories to errors for strict enforcement
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'error',
      'security/detect-possible-timing-attacks': 'error',
    },
  },

  // ── Prettier compat — MUST be last to override formatting rules ───
  prettierConfig,
);
