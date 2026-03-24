import type React from 'react';

export type SectionType =
  | 'commands'
  | 'files'
  | 'conventions'
  | 'issues'
  | 'context'
  | 'skip-list'
  | 'other';

export const SIDEBAR_TEMPLATE_CARD_STYLE: React.CSSProperties = {
  margin: '6px 8px',
  padding: '8px 10px',
  border: '1px solid var(--border-semantic)',
  borderRadius: '6px',
  backgroundColor: 'rgba(255,255,255,0.02)',
};
export const SIDEBAR_TEMPLATE_CARD_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: '4px',
  fontSize: '0.6875rem',
};
export const SIDEBAR_ADD_SECTION_WRAPPER_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  borderTop: '1px solid var(--border-semantic)',
  marginTop: '4px',
};
export const SIDEBAR_ADD_SECTION_LABEL_STYLE: React.CSSProperties = {
  padding: 0,
  marginBottom: '4px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: '0.625rem',
};

export interface ClaudeMdSection {
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  type: SectionType;
}

export interface ClaudeMdTemplate {
  name: string;
  content: string;
}

export interface ClaudeMdTokenTone {
  backgroundColor: string;
  color: string;
  label: 'Light' | 'Moderate' | 'Heavy';
}

export interface ClaudeMdStats {
  fileSize: number;
  tokens: number;
  tone: ClaudeMdTokenTone;
}

const SECTION_KEYWORDS: Record<Exclude<SectionType, 'other'>, RegExp> = {
  commands: /command|script|build|test|run|npm|yarn|pnpm/i,
  files: /file|key file|folder|path|directory|structure/i,
  conventions: /convention|style|pattern|rule|guideline|standard/i,
  issues: /issue|bug|debt|known|todo|fixme|hack|warning/i,
  context: /context|overview|about|description|what|intro|background/i,
  'skip-list': /skip|task.*type|ignore/i,
};

export const SECTION_ICONS: Record<SectionType, string> = {
  commands: '\u25B6',
  files: '\u2630',
  conventions: '\u2714',
  issues: '\u26A0',
  context: '\u2139',
  'skip-list': '\u2716',
  other: '\u2022',
};

export const CLAUDE_MD_TEMPLATES: ClaudeMdTemplate[] = [
  {
    name: 'Key Files',
    content: `## Key Files
| File | Role |
|---|---|
| \`src/main.ts\` | Entry point |
| \`src/index.ts\` | Public API |
`,
  },
  {
    name: 'Commands',
    content: `## Commands
- \`npm run dev\` - start dev server
- \`npm run build\` - production build
- \`npm test\` - run tests
`,
  },
  {
    name: 'Conventions',
    content: `## Conventions
- Describe coding conventions here
- Style guide rules
- Naming patterns
`,
  },
  {
    name: 'Known Issues',
    content: `## Known Issues / Tech Debt
- Issue description here
`,
  },
  {
    name: 'Task Skip List',
    content: `## Task-Type Skip List

| Working on... | Read | Skip |
|---|---|---|
| Feature A | Docs for A | Docs for B, C |
| Feature B | Docs for B | Docs for A, C |
`,
  },
  {
    name: 'Project Context',
    content: `## Project Context
- What this project does
- Key design decisions
- Important constraints
`,
  },
];

function classifySection(title: string): SectionType {
  const normalizedTitle = title.trim();
  for (const [type, matcher] of Object.entries(SECTION_KEYWORDS) as [
    Exclude<SectionType, 'other'>,
    RegExp,
  ][]) {
    if (matcher.test(normalizedTitle)) {
      return type;
    }
  }
  return 'other';
}

export function parseClaudeMdSections(content: string): ClaudeMdSection[] {
  const lines = content.split('\n');
  const sections: ClaudeMdSection[] = [];

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!headingMatch) {
      return;
    }
    if (sections.length > 0) {
      sections[sections.length - 1].endLine = index - 1;
    }
    sections.push({
      title: headingMatch[2].trim(),
      level: headingMatch[1].length,
      startLine: index,
      endLine: lines.length - 1,
      type: classifySection(headingMatch[2]),
    });
  });

  return sections;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getTokenTone(tokens: number): ClaudeMdTokenTone {
  if (tokens < 2000) {
    return { backgroundColor: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', label: 'Light' };
  }
  if (tokens <= 5000) {
    return { backgroundColor: 'rgba(250, 204, 21, 0.15)', color: '#facc15', label: 'Moderate' };
  }
  return { backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171', label: 'Heavy' };
}

export function getClaudeMdStats(content: string): ClaudeMdStats {
  const tokens = estimateTokens(content);
  return {
    fileSize: new Blob([content]).size,
    tokens,
    tone: getTokenTone(tokens),
  };
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function normalizeHeading(line: string): string {
  return line.replace(/^(#{1,6})\s+/, '$1 ');
}

function shouldInsertBlankLine(
  line: string,
  previousBlank: boolean,
  resultLength: number,
): boolean {
  return isHeading(line) && resultLength > 0 && !previousBlank;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function formatClaudeMd(content: string): string {
  const result: string[] = [];
  let previousBlank = false;

  content.split('\n').forEach((line) => {
    const normalizedLine = isHeading(line) ? normalizeHeading(line) : line;
    const blankLine = normalizedLine.trim() === '';

    if (shouldInsertBlankLine(normalizedLine, previousBlank, result.length)) {
      result.push('');
    }
    if (blankLine && previousBlank) {
      return;
    }

    result.push(normalizedLine);
    previousBlank = blankLine;
  });

  return ensureTrailingNewline(result.join('\n'));
}

function getTemplateSeparator(content: string): string {
  if (content.endsWith('\n\n')) {
    return '';
  }
  return content.endsWith('\n') ? '\n' : '\n\n';
}

export function appendTemplate(content: string, templateContent: string): string {
  return `${content}${getTemplateSeparator(content)}${templateContent}`;
}
