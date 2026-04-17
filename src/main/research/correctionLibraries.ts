/**
 * correctionLibraries.ts — Curated canonical library name list for correction detection.
 *
 * Loaded once at module init. The correction detector matches user messages
 * against these names case-insensitively and returns the canonical form.
 *
 * Wave 29.5 Phase H (H4).
 */

// ─── Project dependency names (from package.json) ────────────────────────────
// Derived from production + devDependencies at spec-time. Update as deps change.

const PROJECT_LIBS: readonly string[] = [
  'React',
  'React-DOM',
  'TypeScript',
  'Vite',
  'Electron',
  'electron-vite',
  'Monaco',
  'Tailwind',
  'Zustand',
  'Immer',
  'Express',
  'better-sqlite3',
  'node-pty',
  'xterm',
  'Shiki',
  'Vitest',
  'Playwright',
  'ESLint',
  'Prettier',
  'PostCSS',
  'electron-store',
  'electron-updater',
  'electron-log',
  'react-markdown',
  'DOMPurify',
  'fuse.js',
  'ws',
  'tree-sitter',
  'web-tree-sitter',
  'CodeMirror',
];

// ─── Popular JS/TS ecosystem libraries ───────────────────────────────────────
// Hand-curated top-30 commonly referenced in correction messages.

const POPULAR_LIBS: readonly string[] = [
  'Next.js',
  'Nuxt',
  'SvelteKit',
  'Svelte',
  'Vue',
  'Angular',
  'Remix',
  'Astro',
  'Gatsby',
  'Prisma',
  'Drizzle',
  'tRPC',
  'Zod',
  'Yup',
  'Pinia',
  'Redux',
  'Recoil',
  'Jotai',
  'MobX',
  'Axios',
  'GraphQL',
  'Apollo',
  'SWR',
  'TanStack',
  'Jest',
  'Mocha',
  'Webpack',
  'Rollup',
  'esbuild',
  'Babel',
];

/**
 * Full curated list: project deps first, then popular ecosystem libs.
 * All entries are canonical (correctly cased) — the detector returns these
 * exact strings when a match is found.
 */
export const CURATED_LIBRARIES: readonly string[] = [...PROJECT_LIBS, ...POPULAR_LIBS];
