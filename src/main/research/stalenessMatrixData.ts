/**
 * stalenessMatrixData.ts — Curated top-30 library list for the staleness matrix.
 *
 * This file is the hand-curated baseline. Updates are made via quarterly review —
 * do not edit cutoffVersion/cutoffDate values ad-hoc between reviews.
 *
 * cutoffVersion: last version Claude's training data reliably covers.
 * cutoffDate:    approximate GA date of cutoffVersion (ISO 8601).
 *
 * Pattern-based entries use a `libraryPattern` regex string matched via
 * `String.prototype.startsWith` in the lookup layer, not full regex — keep
 * patterns simple (prefix-only).
 */

import type { StalenessEntry } from './stalenessMatrix';

// ─── Training cutoff ──────────────────────────────────────────────────────────

/**
 * Claude model training cutoff baseline used by the heuristic layer.
 * Quarterly review should advance this when a new model generation ships.
 */
export const TRAINING_CUTOFF_DATE = '2025-06-01';

// ─── Curated entries ──────────────────────────────────────────────────────────

// NOTE: All entries use kind:'curated' with confidence:'high'.
// Versions and dates are estimated to a 2025-06-01 training cutoff.
// Quarterly review is required to keep these accurate.

export const CURATED_STALENESS_ENTRIES: readonly StalenessEntry[] = [
  // ── Meta-frameworks ──────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'next',
    cutoffVersion: '15.0.0',
    cutoffDate: '2024-10-21',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: '@remix-run/react',
    cutoffVersion: '2.10.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'astro',
    cutoffVersion: '4.14.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'nuxt',
    cutoffVersion: '3.13.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: '@sveltejs/kit',
    cutoffVersion: '2.6.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },

  // ── UI libraries ─────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'react',
    cutoffVersion: '19.0.0',
    cutoffDate: '2024-12-05',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'svelte',
    cutoffVersion: '5.0.0',
    cutoffDate: '2024-10-22',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'vue',
    cutoffVersion: '3.5.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: '@angular/core',
    cutoffVersion: '18.0.0',
    cutoffDate: '2024-05-22',
    confidence: 'high',
  },

  // ── AI / LLM ─────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'ai',
    cutoffVersion: '3.4.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },

  // ── Styling ───────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'tailwindcss',
    cutoffVersion: '4.0.0',
    cutoffDate: '2025-01-22',
    confidence: 'high',
  },

  // ── Data / ORM ────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: '@prisma/client',
    cutoffVersion: '5.20.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'drizzle-orm',
    cutoffVersion: '0.33.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },

  // ── Validation ────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'zod',
    cutoffVersion: '3.23.0',
    cutoffDate: '2024-06-01',
    confidence: 'high',
  },

  // ── API layer ─────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: '@trpc/server',
    cutoffVersion: '11.0.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'hono',
    cutoffVersion: '4.5.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'elysia',
    cutoffVersion: '1.1.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },

  // ── Build tooling ─────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'vite',
    cutoffVersion: '5.4.0',
    cutoffDate: '2024-08-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'electron',
    cutoffVersion: '32.0.0',
    cutoffDate: '2024-08-20',
    confidence: 'high',
  },

  // ── Runtimes (type packages / namespace) ──────────────────────────────────
  {
    kind: 'curated',
    library: 'bun-types',
    cutoffVersion: '1.1.0',
    cutoffDate: '2024-06-01',
    confidence: 'high',
  },

  // ── TanStack ─────────────────────────────────────────────────────────────
  {
    kind: 'curated',
    library: '@tanstack/react-query',
    cutoffVersion: '5.56.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: '@tanstack/react-router',
    cutoffVersion: '1.58.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },

  // ── Component / icon libraries ────────────────────────────────────────────
  {
    kind: 'curated',
    library: 'lucide-react',
    cutoffVersion: '0.441.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
  {
    kind: 'curated',
    library: 'framer-motion',
    cutoffVersion: '11.5.0',
    cutoffDate: '2024-09-01',
    confidence: 'high',
  },
];

// ─── Pattern-based curated prefixes ──────────────────────────────────────────

/**
 * Package name prefixes treated as curated-stale. Any import starting with
 * one of these strings will match as a curated entry (confidence:'high').
 * Used for scoped package families where all packages move together.
 *
 * Synthetic StalenessEntry returned by the lookup layer for pattern matches:
 *   kind:'curated', cutoffVersion:'*', cutoffDate: TRAINING_CUTOFF_DATE
 */
export const CURATED_STALE_PREFIXES: readonly string[] = [
  '@radix-ui/react-',
  '@deno/',
];
