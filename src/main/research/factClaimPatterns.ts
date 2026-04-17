/**
 * factClaimPatterns.ts — Fact-shaped claim pattern data file.
 *
 * Wave 30 Phase F. Pure data — no logic. Each pattern targets a library's
 * characteristic API surface in outgoing stream text. Patterns must not be
 * backtracking-prone: use \b anchors and \w+ classes; avoid .*.
 *
 * confidence:
 *   'high'   — pattern is library-specific; few false positives expected
 *   'medium' — pattern may match other frameworks with similar conventions
 *   'low'    — pattern is ambiguous; requires higher trigger bar in the detector
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactClaimPattern {
  library: string;        // normalised library id matching staleness matrix keys
  pattern: RegExp;        // what to look for in the stream
  confidence: 'high' | 'medium' | 'low';
  description: string;   // human-readable — what kind of claim this catches
}

// ─── Pattern registry ─────────────────────────────────────────────────────────

export const FACT_CLAIM_PATTERNS: readonly FactClaimPattern[] = [
  {
    library: 'react',
    pattern: /\buse[A-Z]\w+\s*\(/,
    confidence: 'medium',
    description: 'React hook invocation',
  },
  {
    library: 'zod',
    pattern: /\bz\.\w+\s*\(/,
    confidence: 'high',
    description: 'Zod builder call',
  },
  {
    library: '@prisma/client',
    pattern: /\bprisma\.\w+\.\w+/,
    confidence: 'high',
    description: 'Prisma query',
  },
  {
    library: 'next',
    pattern: /\buse(?:Router|Pathname|SearchParams|Params)\s*\(/,
    confidence: 'high',
    description: 'Next.js navigation hook',
  },
  {
    library: '@tanstack/react-query',
    pattern: /\buse(?:Query|Mutation|QueryClient|InfiniteQuery|Suspense\w*)\s*\(/,
    confidence: 'medium',
    description: 'TanStack Query hook',
  },
  {
    library: 'drizzle-orm',
    pattern: /\b(?:db|sql)\.(?:select|insert|update|delete)\s*\(/,
    confidence: 'medium',
    description: 'Drizzle query',
  },
  {
    library: 'svelte',
    pattern: /\$state\s*\(|\$derived\s*\(|\$effect\s*\(/,
    confidence: 'high',
    description: 'Svelte 5 runes',
  },
  {
    library: 'hono',
    pattern: /\bapp\.(?:get|post|put|delete|patch)\s*\(/,
    confidence: 'low',
    description: 'Hono route (ambiguous with Express)',
  },
  {
    library: 'framer-motion',
    pattern: /\bmotion\.\w+/,
    confidence: 'high',
    description: 'Framer Motion component',
  },
];
