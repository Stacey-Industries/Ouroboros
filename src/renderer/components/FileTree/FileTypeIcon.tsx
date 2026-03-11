import React from 'react';

/**
 * FileTypeIcon.tsx — Renders a 16×16 inline SVG icon for a given filename.
 *
 * All SVGs are inline (no external assets, no network requests, works offline).
 * Colors are either language-specific constants or CSS custom properties.
 */

// ─── Colour constants ──────────────────────────────────────────────────────────

const C = {
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

// ─── Folder colour helpers ────────────────────────────────────────────────────

function folderColor(name: string, open: boolean): string {
  const lower = name.toLowerCase().replace(/[/\\]$/, '');
  if (lower === 'src' || lower === 'source') return open ? '#e8a87c' : '#c87941';
  if (lower === 'docs' || lower === 'documentation') return open ? '#5b9bd5' : '#3a7bbf';
  if (lower === 'node_modules') return '#555';
  if (lower === '.git') return '#f14e32';
  if (lower === 'dist' || lower === 'out' || lower === 'build') return '#888';
  return 'var(--accent)';
}

// ─── SVG shape primitives ─────────────────────────────────────────────────────

/** Generic document / file icon */
function DocIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path
        d="M3 2h7l3 3v9H3V2z"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M10 2v3h3"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="5" y1="7" x2="11" y2="7" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="9.5" x2="11" y2="9.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="12" x2="9" y2="12" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

/** "TS" badge icon */
function TsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} />
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="bold"
        fontFamily="monospace"
        fill="#fff"
      >
        TS
      </text>
    </svg>
  );
}

/** "JS" badge icon */
function JsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} />
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="bold"
        fontFamily="monospace"
        fill="#222"
      >
        JS
      </text>
    </svg>
  );
}

/** Python snake/badge icon */
function PyIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {/* Body: two interlocking rounded rectangles — simplified Python logo shape */}
      <rect x="3" y="2.5" width="6" height="5.5" rx="1.5" fill={color} />
      <rect x="7" y="8" width="6" height="5.5" rx="1.5" fill={color} fillOpacity="0.7" />
      {/* head dots */}
      <circle cx="7.5" cy="4.5" r="0.9" fill="#fff" fillOpacity="0.9" />
      <circle cx="8.5" cy="11.5" r="0.9" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

/** JSON curly brace icon */
function JsonIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fontFamily="monospace"
        fill={color}
      >
        {'{'}
      </text>
    </svg>
  );
}

/** Markdown #-heading icon */
function MdIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {/* Letter M shape */}
      <path
        d="M2 12V4l4 5 4-5v8"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8h2M13 6v4"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** CSS hashtag/hash icon */
function CssIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {/* Hash symbol */}
      <line x1="5" y1="3" x2="4" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="3" x2="9" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="6.5" x2="13" y2="6.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="9.5" x2="13" y2="9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** HTML angle-bracket icon */
function HtmlIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path
        d="M4 5L1 8l3 3"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 5l3 3-3 3"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="3"
        x2="6"
        y2="13"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
    </svg>
  );
}

/** YAML/TOML dash-list icon */
function YamlIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <line x1="3" y1="4.5" x2="5" y2="4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="4.5" x2="13" y2="4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="3" y1="8" x2="5" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="8" x2="11" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="3" y1="11.5" x2="5" y2="11.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="11.5" x2="13" y2="11.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

/** Rust gear-like icon (cog silhouette) */
function RsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {/* Simplified cog/gear */}
      <circle cx="8" cy="8" r="2.5" fill={color} />
      <circle cx="8" cy="8" r="5" fill="none" stroke={color} strokeWidth="1" />
      {/* Gear teeth — 8 points */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 8 + Math.cos(rad) * 4.5;
        const y1 = 8 + Math.sin(rad) * 4.5;
        const x2 = 8 + Math.cos(rad) * 6;
        const y2 = 8 + Math.sin(rad) * 6;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/** Go gopher-silhouette / badge icon */
function GoIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="monospace"
        fill={color}
      >
        Go
      </text>
    </svg>
  );
}

/** Shell terminal icon */
function ShIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" />
      <path
        d="M4 6.5l2.5 2-2.5 2"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="8" y1="10.5" x2="12" y2="10.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Image mountain icon */
function ImgIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" />
      {/* mountains */}
      <path
        d="M2 12l3.5-5 3 3.5 2-2.5 3.5 4z"
        fill={color}
        fillOpacity="0.6"
        stroke="none"
      />
      {/* sun */}
      <circle cx="12" cy="5.5" r="1.3" fill={color} />
    </svg>
  );
}

/** Config gear icon */
function CfgIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="2" fill={color} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 8 + Math.cos(rad) * 3.5;
        const y1 = 8 + Math.sin(rad) * 3.5;
        const x2 = 8 + Math.cos(rad) * 5.5;
        const y2 = 8 + Math.sin(rad) * 5.5;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="8" cy="8" r="3.5" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** Lock icon for lock files */
function LockIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {/* shackle */}
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* body */}
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <circle cx="8" cy="10.5" r="1.2" fill={color} />
    </svg>
  );
}

/** Folder icon — open or closed, with colour */
function FolderSvgIcon({
  open,
  color,
}: {
  open: boolean;
  color: string;
}): React.ReactElement {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <path
          d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 6.5h13l-2 6h-9z"
          fill={color}
          fillOpacity="0.2"
          stroke={color}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path
        d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Extension → icon lookup ──────────────────────────────────────────────────

type IconKind =
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

interface IconSpec {
  kind: IconKind;
  color: string;
}

const EXT_MAP: Record<string, IconSpec> = {
  // TypeScript
  ts:       { kind: 'ts',    color: C.ts },
  tsx:      { kind: 'tsx',   color: C.ts },
  // JavaScript
  js:       { kind: 'js',    color: C.js },
  jsx:      { kind: 'jsx',   color: C.js },
  mjs:      { kind: 'mjs',   color: C.js },
  cjs:      { kind: 'cjs',   color: C.js },
  // Python
  py:       { kind: 'py',    color: C.py },
  pyi:      { kind: 'py',    color: C.py },
  // JSON
  json:     { kind: 'json',  color: C.json },
  jsonc:    { kind: 'json',  color: C.json },
  // Markdown
  md:       { kind: 'md',    color: C.md },
  mdx:      { kind: 'md',    color: C.md },
  // CSS
  css:      { kind: 'css',   color: C.css },
  scss:     { kind: 'css',   color: '#c6538c' },
  sass:     { kind: 'css',   color: '#c6538c' },
  less:     { kind: 'css',   color: '#1d365d' },
  styl:     { kind: 'css',   color: C.css },
  // HTML
  html:     { kind: 'html',  color: C.html },
  htm:      { kind: 'html',  color: C.html },
  xml:      { kind: 'html',  color: '#f0803c' },
  // YAML / TOML
  yaml:     { kind: 'yaml',  color: C.yaml },
  yml:      { kind: 'yaml',  color: C.yaml },
  toml:     { kind: 'yaml',  color: '#9c4221' },
  // Rust
  rs:       { kind: 'rs',    color: C.rs },
  // Go
  go:       { kind: 'go',    color: C.go },
  // Shell
  sh:       { kind: 'sh',    color: C.sh },
  bash:     { kind: 'sh',    color: C.sh },
  zsh:      { kind: 'sh',    color: C.sh },
  fish:     { kind: 'sh',    color: C.sh },
  bat:      { kind: 'sh',    color: '#89e051' },
  // Images
  png:      { kind: 'img',   color: C.img },
  jpg:      { kind: 'img',   color: C.img },
  jpeg:     { kind: 'img',   color: C.img },
  gif:      { kind: 'img',   color: C.img },
  svg:      { kind: 'img',   color: C.img },
  webp:     { kind: 'img',   color: C.img },
  ico:      { kind: 'img',   color: C.img },
  bmp:      { kind: 'img',   color: C.img },
  // Config / dotfiles
  env:      { kind: 'cfg',   color: C.cfg },
  gitignore:{ kind: 'cfg',   color: C.cfg },
  editorconfig: { kind: 'cfg', color: C.cfg },
  // Lock files
  lock:     { kind: 'lock',  color: C.lock },
  // Ruby
  rb:       { kind: 'rb',    color: C.ruby },
  // C / C++
  c:        { kind: 'cpp',   color: C.cpp },
  h:        { kind: 'cpp',   color: C.cpp },
  cpp:      { kind: 'cpp',   color: C.cpp },
  cc:       { kind: 'cpp',   color: C.cpp },
  cxx:      { kind: 'cpp',   color: C.cpp },
  hpp:      { kind: 'cpp',   color: C.cpp },
  // Java / Kotlin
  java:     { kind: 'java',  color: C.java },
  kt:       { kind: 'kt',    color: C.kt },
  // Swift
  swift:    { kind: 'swift', color: C.swift },
  // C#
  cs:       { kind: 'cs',    color: C.cs },
  // PHP
  php:      { kind: 'php',   color: C.php },
  // SQL
  sql:      { kind: 'sql',   color: C.sql },
  prisma:   { kind: 'prisma',color: C.prisma },
  // Docker
  dockerfile: { kind: 'docker', color: C.docker },
  // Text
  txt:      { kind: 'text',  color: C.text },
  rst:      { kind: 'text',  color: C.text },
  log:      { kind: 'text',  color: C.text },
};

/** Full-filename overrides for lock files and special dotfiles */
const FILENAME_MAP: Record<string, IconSpec> = {
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

function resolveSpec(filename: string): IconSpec {
  const lower = filename.toLowerCase();

  // Full filename match (highest priority)
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];

  // Dotfile with no further extension, e.g. ".env", ".gitignore"
  if (lower.startsWith('.') && !lower.slice(1).includes('.')) {
    const key = lower.slice(1);
    return EXT_MAP[key] ?? { kind: 'default', color: C.text };
  }

  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1) return { kind: 'default', color: C.text };

  const ext = lower.slice(lastDot + 1);
  return EXT_MAP[ext] ?? { kind: 'default', color: C.text };
}

function renderFileIcon(spec: IconSpec): React.ReactElement {
  switch (spec.kind) {
    case 'ts':
    case 'tsx':
      return <TsIcon color={spec.color} />;
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return <JsIcon color={spec.color} />;
    case 'py':
      return <PyIcon color={spec.color} />;
    case 'json':
      return <JsonIcon color={spec.color} />;
    case 'md':
      return <MdIcon color={spec.color} />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl':
      return <CssIcon color={spec.color} />;
    case 'html':
      return <HtmlIcon color={spec.color} />;
    case 'yaml':
      return <YamlIcon color={spec.color} />;
    case 'rs':
      return <RsIcon color={spec.color} />;
    case 'go':
      return <GoIcon color={spec.color} />;
    case 'sh':
      return <ShIcon color={spec.color} />;
    case 'img':
      return <ImgIcon color={spec.color} />;
    case 'cfg':
    case 'docker':
      return <CfgIcon color={spec.color} />;
    case 'lock':
      return <LockIcon color={spec.color} />;
    default:
      return <DocIcon color={spec.color} />;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FileTypeIconProps {
  /** Basename of the file, e.g. "index.tsx" or ".env" */
  filename: string;
}

/**
 * Renders a 16×16 inline SVG file-type icon for the given filename.
 */
export function FileTypeIcon({ filename }: FileTypeIconProps): React.ReactElement {
  const spec = resolveSpec(filename);
  return renderFileIcon(spec);
}

export interface FolderTypeIconProps {
  /** Basename of the folder, e.g. "src", "node_modules" */
  name: string;
  /** Whether the folder is currently expanded/open */
  open: boolean;
}

/**
 * Renders a 16×16 inline SVG folder icon.
 * Special directories (src, docs, node_modules, .git, dist/out/build)
 * get distinct colours; everything else uses var(--accent).
 */
export function FolderTypeIcon({ name, open }: FolderTypeIconProps): React.ReactElement {
  const color = folderColor(name, open);
  return <FolderSvgIcon open={open} color={color} />;
}
