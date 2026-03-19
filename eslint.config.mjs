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

      // Allow _prefixed unused vars (common TypeScript pattern for required-but-unused params)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // Downgrade to warnings — codebase has legitimate uses that need gradual typing
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',

      // ── Complexity / size guards (warn-level, aspirational) ─────
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', 20],
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 5],
      'max-params': ['error', 5],

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
      // Keep critical security rules as errors, downgrade noisy false-positives to warnings
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
    },
  },

  // ── Prettier compat — MUST be last to override formatting rules ───
  prettierConfig,
);
