/**
 * fileIcons.ts — Maps file extensions to display metadata.
 * Returns a color (CSS value) and a short label for use in the file list.
 */

export interface FileIconInfo {
  color: string;
  label: string;
}

const ICON_MAP: Record<string, FileIconInfo> = {
  // TypeScript
  ts: { color: 'var(--accent)', label: 'TS' },
  tsx: { color: 'var(--accent)', label: 'TSX' },
  // JavaScript
  js: { color: '#f7df1e', label: 'JS' },
  jsx: { color: '#f7df1e', label: 'JSX' },
  mjs: { color: '#f7df1e', label: 'MJS' },
  cjs: { color: '#f7df1e', label: 'CJS' },
  // JSON / config
  json: { color: 'var(--success)', label: 'JSON' },
  jsonc: { color: 'var(--success)', label: 'JSONC' },
  yaml: { color: 'var(--success)', label: 'YAML' },
  yml: { color: 'var(--success)', label: 'YAML' },
  toml: { color: 'var(--success)', label: 'TOML' },
  // Markup
  html: { color: 'var(--warning)', label: 'HTML' },
  htm: { color: 'var(--warning)', label: 'HTML' },
  xml: { color: 'var(--warning)', label: 'XML' },
  svg: { color: 'var(--warning)', label: 'SVG' },
  // Styles
  css: { color: 'var(--purple)', label: 'CSS' },
  scss: { color: 'var(--purple)', label: 'SCSS' },
  sass: { color: 'var(--purple)', label: 'SASS' },
  less: { color: 'var(--purple)', label: 'LESS' },
  // Markdown / docs
  md: { color: 'var(--text-muted)', label: 'MD' },
  mdx: { color: 'var(--text-muted)', label: 'MDX' },
  txt: { color: 'var(--text-muted)', label: 'TXT' },
  rst: { color: 'var(--text-muted)', label: 'RST' },
  // Python
  py: { color: '#4b8bbe', label: 'PY' },
  pyi: { color: '#4b8bbe', label: 'PYI' },
  // Rust
  rs: { color: 'var(--warning)', label: 'RS' },
  // Go
  go: { color: '#00acd7', label: 'GO' },
  // Ruby
  rb: { color: '#cc342d', label: 'RB' },
  // Shell
  sh: { color: 'var(--success)', label: 'SH' },
  bash: { color: 'var(--success)', label: 'SH' },
  zsh: { color: 'var(--success)', label: 'SH' },
  fish: { color: 'var(--success)', label: 'SH' },
  bat: { color: 'var(--success)', label: 'BAT' },
  // C / C++
  c: { color: '#a8b9cc', label: 'C' },
  h: { color: '#a8b9cc', label: 'H' },
  cpp: { color: '#a8b9cc', label: 'C++' },
  cc: { color: '#a8b9cc', label: 'C++' },
  cxx: { color: '#a8b9cc', label: 'C++' },
  hpp: { color: '#a8b9cc', label: 'H++' },
  // Java / Kotlin
  java: { color: '#b07219', label: 'JAVA' },
  kt: { color: '#a97bff', label: 'KT' },
  // Swift
  swift: { color: '#f05138', label: 'SWIFT' },
  // C#
  cs: { color: '#178600', label: 'C#' },
  // PHP
  php: { color: '#4f5d95', label: 'PHP' },
  // Database
  sql: { color: '#e38c00', label: 'SQL' },
  prisma: { color: 'var(--accent)', label: 'PRISMA' },
  // Config / dotfiles
  env: { color: 'var(--success)', label: 'ENV' },
  gitignore: { color: 'var(--text-faint)', label: 'GIT' },
  dockerfile: { color: '#384d54', label: 'DOCK' },
  // Misc
  lock: { color: 'var(--text-faint)', label: 'LOCK' },
  log: { color: 'var(--text-faint)', label: 'LOG' },
};

const FALLBACK: FileIconInfo = { color: 'var(--text-faint)', label: 'FILE' };

/**
 * Returns icon info for a given filename or extension.
 * Handles dotfiles (e.g. ".env", ".gitignore") by using the full name minus the dot.
 */
export function getFileIcon(filename: string): FileIconInfo {
  const lower = filename.toLowerCase();

  // Handle dotfiles like ".env", ".gitignore"
  if (lower.startsWith('.') && !lower.slice(1).includes('.')) {
    const dotfileName = lower.slice(1);
    return ICON_MAP[dotfileName] ?? FALLBACK;
  }

  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1) return FALLBACK;

  const ext = lower.slice(lastDot + 1);
  return ICON_MAP[ext] ?? FALLBACK;
}
