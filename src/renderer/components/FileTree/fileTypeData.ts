/**
 * fileTypeData.ts — Icon colour constants, extension maps, and filename overrides
 * for file-type icon resolution.
 *
 * Extracted from FileTypeIcon.tsx to reduce file size.
 */

// ─── Colour constants ──────────────────────────────────────────────────────────

export const C = {
  ts: '#3178c6',
  js: '#f0db4f',
  py: '#3572A5',
  json: '#cbcb41',
  md: '#519aba',
  css: '#cc6699',
  html: '#e34c26',
  yaml: '#cb171e',
  rs: '#dea584',
  go: '#00acd7',
  sh: '#89e051',
  img: '#a074c4',
  cfg: '#6d8086',
  lock: '#8b8b8b',
  ruby: '#cc342d',
  cpp: '#a8b9cc',
  java: '#b07219',
  kt: '#a97bff',
  swift: '#f05138',
  cs: '#178600',
  php: '#4f5d95',
  sql: '#e38c00',
  docker: '#384d54',
  prisma: '#3178c6',
  text: 'var(--text-faint)',
} as const;

// ─── Icon kind union ─────────────────────────────────────────────────────────

export type IconKind =
  | 'ts' | 'tsx'
  | 'js' | 'jsx' | 'mjs' | 'cjs'
  | 'py'
  | 'json'
  | 'md'
  | 'css' | 'scss' | 'sass' | 'less' | 'styl'
  | 'html'
  | 'yaml'
  | 'rs'
  | 'go'
  | 'sh'
  | 'img'
  | 'cfg'
  | 'lock'
  | 'rb'
  | 'cpp'
  | 'java'
  | 'kt'
  | 'swift'
  | 'cs'
  | 'php'
  | 'sql'
  | 'docker'
  | 'prisma'
  | 'text'
  | 'default';

export interface IconSpec {
  kind: IconKind;
  color: string;
}

// ─── Extension → icon lookup ──────────────────────────────────────────────────

export const EXT_MAP: Record<string, IconSpec> = {
  ts:       { kind: 'ts',    color: C.ts },
  tsx:      { kind: 'tsx',   color: C.ts },
  js:       { kind: 'js',    color: C.js },
  jsx:      { kind: 'jsx',   color: C.js },
  mjs:      { kind: 'mjs',   color: C.js },
  cjs:      { kind: 'cjs',   color: C.js },
  py:       { kind: 'py',    color: C.py },
  pyi:      { kind: 'py',    color: C.py },
  json:     { kind: 'json',  color: C.json },
  jsonc:    { kind: 'json',  color: C.json },
  md:       { kind: 'md',    color: C.md },
  mdx:      { kind: 'md',    color: C.md },
  css:      { kind: 'css',   color: C.css },
  scss:     { kind: 'css',   color: '#c6538c' },
  sass:     { kind: 'css',   color: '#c6538c' },
  less:     { kind: 'css',   color: '#1d365d' },
  styl:     { kind: 'css',   color: C.css },
  html:     { kind: 'html',  color: C.html },
  htm:      { kind: 'html',  color: C.html },
  xml:      { kind: 'html',  color: '#f0803c' },
  yaml:     { kind: 'yaml',  color: C.yaml },
  yml:      { kind: 'yaml',  color: C.yaml },
  toml:     { kind: 'yaml',  color: '#9c4221' },
  rs:       { kind: 'rs',    color: C.rs },
  go:       { kind: 'go',    color: C.go },
  sh:       { kind: 'sh',    color: C.sh },
  bash:     { kind: 'sh',    color: C.sh },
  zsh:      { kind: 'sh',    color: C.sh },
  fish:     { kind: 'sh',    color: C.sh },
  bat:      { kind: 'sh',    color: '#89e051' },
  png:      { kind: 'img',   color: C.img },
  jpg:      { kind: 'img',   color: C.img },
  jpeg:     { kind: 'img',   color: C.img },
  gif:      { kind: 'img',   color: C.img },
  svg:      { kind: 'img',   color: C.img },
  webp:     { kind: 'img',   color: C.img },
  ico:      { kind: 'img',   color: C.img },
  bmp:      { kind: 'img',   color: C.img },
  env:      { kind: 'cfg',   color: C.cfg },
  gitignore:{ kind: 'cfg',   color: C.cfg },
  editorconfig: { kind: 'cfg', color: C.cfg },
  lock:     { kind: 'lock',  color: C.lock },
  rb:       { kind: 'rb',    color: C.ruby },
  c:        { kind: 'cpp',   color: C.cpp },
  h:        { kind: 'cpp',   color: C.cpp },
  cpp:      { kind: 'cpp',   color: C.cpp },
  cc:       { kind: 'cpp',   color: C.cpp },
  cxx:      { kind: 'cpp',   color: C.cpp },
  hpp:      { kind: 'cpp',   color: C.cpp },
  java:     { kind: 'java',  color: C.java },
  kt:       { kind: 'kt',    color: C.kt },
  swift:    { kind: 'swift', color: C.swift },
  cs:       { kind: 'cs',    color: C.cs },
  php:      { kind: 'php',   color: C.php },
  sql:      { kind: 'sql',   color: C.sql },
  prisma:   { kind: 'prisma',color: C.prisma },
  dockerfile: { kind: 'docker', color: C.docker },
  txt:      { kind: 'text',  color: C.text },
  rst:      { kind: 'text',  color: C.text },
  log:      { kind: 'text',  color: C.text },
};

/** Full-filename overrides for lock files and special dotfiles */
export const FILENAME_MAP: Record<string, IconSpec> = {
  'package-lock.json':    { kind: 'lock',   color: C.lock },
  'yarn.lock':            { kind: 'lock',   color: C.lock },
  'cargo.lock':           { kind: 'lock',   color: C.lock },
  'pnpm-lock.yaml':       { kind: 'lock',   color: C.lock },
  'bun.lockb':            { kind: 'lock',   color: C.lock },
  '.env':                 { kind: 'cfg',    color: C.cfg },
  '.env.local':           { kind: 'cfg',    color: C.cfg },
  '.env.production':      { kind: 'cfg',    color: C.cfg },
  '.env.development':     { kind: 'cfg',    color: C.cfg },
  '.gitignore':           { kind: 'cfg',    color: C.cfg },
  '.gitattributes':       { kind: 'cfg',    color: C.cfg },
  '.editorconfig':        { kind: 'cfg',    color: C.cfg },
  '.prettierrc':          { kind: 'cfg',    color: C.cfg },
  '.eslintrc':            { kind: 'cfg',    color: C.cfg },
  '.eslintrc.json':       { kind: 'cfg',    color: C.cfg },
  '.eslintrc.js':         { kind: 'cfg',    color: C.cfg },
  '.babelrc':             { kind: 'cfg',    color: C.cfg },
  'dockerfile':           { kind: 'docker', color: C.docker },
};

/** Resolve a filename to its icon spec */
export function resolveSpec(filename: string): IconSpec {
  const lower = filename.toLowerCase();

  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];

  if (lower.startsWith('.') && !lower.slice(1).includes('.')) {
    const key = lower.slice(1);
    return EXT_MAP[key] ?? { kind: 'default', color: C.text };
  }

  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1) return { kind: 'default', color: C.text };

  const ext = lower.slice(lastDot + 1);
  return EXT_MAP[ext] ?? { kind: 'default', color: C.text };
}

/** Folder colour by name */
export function folderColor(name: string, open: boolean): string {
  const lower = name.toLowerCase().replace(/[/\\]$/, '');
  const MAP: Record<string, [string, string]> = {
    src: ['#e8a87c', '#c87941'],
    source: ['#e8a87c', '#c87941'],
    docs: ['#5b9bd5', '#3a7bbf'],
    documentation: ['#5b9bd5', '#3a7bbf'],
    node_modules: ['#555', '#555'],
    '.git': ['#f14e32', '#f14e32'],
    dist: ['#888', '#888'],
    out: ['#888', '#888'],
    build: ['#888', '#888'],
  };
  const match = MAP[lower];
  if (match) return open ? match[0] : match[1];
  return 'var(--accent)';
}
