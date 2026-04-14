import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactCompilerPlugin from 'eslint-plugin-react-compiler';
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
      'e2e/',
      '*.config.*',
      'spike/',
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
      'react-compiler': reactCompilerPlugin,
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
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'complexity': ['error', 10],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // ── React Compiler — flags rule violations statically ─────────
      // NOTE: 'warn' (not 'error') — large existing codebase has ~65 pre-existing
      // violations (mostly prop mutation). Compiler bails gracefully on these;
      // fix them incrementally and promote to 'error' once clean.
      'react-compiler/react-compiler': 'warn',

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

  // ── Relaxed rules for test files ─────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },

  // ── Prettier compat — MUST be last to override formatting rules ───
  prettierConfig,
);
