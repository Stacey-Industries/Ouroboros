/**
 * ClaudeMdEditor.tsx — Enhanced CLAUDE.md editor with structure awareness.
 *
 * Wraps InlineEditor with:
 * - Left sidebar: section outline parsed from markdown headings
 * - Top bar: token count estimate, file size, format button
 * - Right panel (collapsible): section template library
 */

import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { InlineEditor, type InlineEditorHandle } from './InlineEditor';

// ─── Section parsing ─────────────────────────────────────────────────────────

export type SectionType = 'commands' | 'files' | 'conventions' | 'issues' | 'context' | 'skip-list' | 'other';

export interface ClaudeMdSection {
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  type: SectionType;
}

const SECTION_KEYWORDS: Record<SectionType, RegExp> = {
  commands: /command|script|build|test|run|npm|yarn|pnpm/i,
  files: /file|key file|folder|path|directory|structure/i,
  conventions: /convention|style|pattern|rule|guideline|standard/i,
  issues: /issue|bug|debt|known|todo|fixme|hack|warning/i,
  context: /context|overview|about|description|what|intro|background/i,
  'skip-list': /skip|task.*type|ignore/i,
};

function classifySection(title: string): SectionType {
  for (const [type, re] of Object.entries(SECTION_KEYWORDS) as [SectionType, RegExp][]) {
    if (re.test(title)) return type;
  }
  return 'other';
}

export function parseClaudeMdSections(content: string): ClaudeMdSection[] {
  const lines = content.split('\n');
  const sections: ClaudeMdSection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      // Close the previous section
      if (sections.length > 0) {
        sections[sections.length - 1].endLine = i - 1;
      }
      sections.push({
        title: match[2].trim(),
        level: match[1].length,
        startLine: i,
        endLine: lines.length - 1, // will be updated when next section is found
        type: classifySection(match[2]),
      });
    }
  }

  return sections;
}

// ─── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 characters per token for English/code mix
  return Math.ceil(text.length / 4);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tokenColor(tokens: number): string {
  if (tokens < 2000) return '#4ade80'; // green
  if (tokens <= 5000) return '#facc15'; // yellow
  return '#f87171'; // red
}

// ─── Section icons ───────────────────────────────────────────────────────────

const SECTION_ICONS: Record<SectionType, string> = {
  commands: '\u25B6',   // play triangle
  files: '\u2630',      // trigram / hamburger
  conventions: '\u2714', // checkmark
  issues: '\u26A0',      // warning
  context: '\u2139',     // info
  'skip-list': '\u2716', // X mark
  other: '\u2022',       // bullet
};

// ─── Templates ───────────────────────────────────────────────────────────────

const CLAUDE_MD_TEMPLATES: { name: string; content: string }[] = [
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
- \`npm run dev\` \u2014 start dev server
- \`npm run build\` \u2014 production build
- \`npm test\` \u2014 run tests
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

// ─── Format helper ───────────────────────────────────────────────────────────

function formatClaudeMd(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let prevWasBlank = false;
  let prevWasHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlank = line.trim() === '';
    const isHeading = /^#{1,6}\s+/.test(line);

    // Ensure blank line before headings (except at start of file)
    if (isHeading && result.length > 0 && !prevWasBlank) {
      result.push('');
    }

    // Ensure blank line after headings
    if (prevWasHeading && !isBlank && !isHeading) {
      // Already handled by normal flow
    }

    // Collapse multiple blank lines into one
    if (isBlank && prevWasBlank) continue;

    // Normalize heading spacing: ensure single space after #
    if (isHeading) {
      const normalized = line.replace(/^(#{1,6})\s+/, '$1 ');
      result.push(normalized);
    } else {
      result.push(line);
    }

    prevWasBlank = isBlank;
    prevWasHeading = isHeading;
  }

  // Ensure trailing newline
  const text = result.join('\n');
  return text.endsWith('\n') ? text : text + '\n';
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ClaudeMdEditorProps {
  content: string;
  filePath: string;
  themeId: string;
  projectRoot?: string | null;
  onSave: (content: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ClaudeMdEditor = memo(function ClaudeMdEditor({
  content,
  filePath,
  themeId,
  projectRoot,
  onSave,
  onDirtyChange,
}: ClaudeMdEditorProps): React.ReactElement {
  const [showTemplates, setShowTemplates] = useState(false);
  const [currentContent, setCurrentContent] = useState(content);
  const editorRef = useRef<InlineEditorHandle>(null);

  // Track content updates from parent
  useEffect(() => {
    setCurrentContent(content);
  }, [content]);

  const sections = useMemo(() => parseClaudeMdSections(currentContent), [currentContent]);
  const tokens = useMemo(() => estimateTokens(currentContent), [currentContent]);
  const fileSize = useMemo(() => new Blob([currentContent]).size, [currentContent]);

  // Handle save with optional formatting
  const handleSave = useCallback((text: string) => {
    setCurrentContent(text);
    onSave(text);
  }, [onSave]);

  // Handle dirty change — also track content for section parsing
  const handleDirtyChange = useCallback((dirty: boolean) => {
    onDirtyChange(dirty);
  }, [onDirtyChange]);

  // Format button
  const handleFormat = useCallback(() => {
    const liveContent = editorRef.current?.getContent() ?? content;
    const formatted = formatClaudeMd(liveContent);
    handleSave(formatted);
  }, [content, handleSave]);

  // Insert template at end of document
  const handleInsertTemplate = useCallback((templateContent: string) => {
    // Append template to current (live) content with spacing
    const current = editorRef.current?.getContent() ?? content;
    const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
    const newContent = current + separator + templateContent;
    handleSave(newContent);
  }, [content, handleSave]);

  // Scroll to section line using the agent-ide:scroll-to-line event mechanism
  const handleScrollToSection = useCallback((section: ClaudeMdSection) => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:scroll-to-line', {
        detail: { filePath, line: section.startLine + 1 },
      }),
    );
  }, [filePath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar — token count, file size, format */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg)',
          fontFamily: 'var(--font-ui)',
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>CLAUDE.md Editor</span>

        <span style={{ marginLeft: 'auto' }} />

        {/* Token count */}
        <span title="Estimated token count (~4 chars/token)">
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: tokenColor(tokens),
              marginRight: '4px',
            }}
          />
          {tokens.toLocaleString()} tokens
        </span>

        {/* File size */}
        <span title="File size on disk">{formatBytes(fileSize)}</span>

        {/* Budget indicator */}
        <span
          title="Token budget: CLAUDE.md typically uses 1-5K of ~200K context"
          style={{
            padding: '1px 6px',
            borderRadius: '3px',
            backgroundColor: tokens < 2000 ? 'rgba(74, 222, 128, 0.15)' : tokens <= 5000 ? 'rgba(250, 204, 21, 0.15)' : 'rgba(248, 113, 113, 0.15)',
            color: tokenColor(tokens),
          }}
        >
          {tokens < 2000 ? 'Light' : tokens <= 5000 ? 'Moderate' : 'Heavy'}
        </span>

        {/* Format button */}
        <button
          onClick={handleFormat}
          title="Normalize headings and whitespace"
          style={{
            padding: '1px 8px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Format
        </button>

        {/* Templates toggle */}
        <button
          onClick={() => setShowTemplates((p) => !p)}
          title="Toggle template library"
          style={{
            padding: '1px 8px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
            border: '1px solid',
            borderColor: showTemplates ? 'var(--accent)' : 'var(--border)',
            borderRadius: '4px',
            backgroundColor: showTemplates ? 'var(--accent)' : 'transparent',
            color: showTemplates ? 'var(--bg)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Templates
        </button>
      </div>

      {/* Main area: sidebar + editor + templates */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — section outline */}
        <div
          style={{
            width: '200px',
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            backgroundColor: 'var(--bg)',
            overflow: 'auto',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.6875rem',
          }}
        >
          <div
            style={{
              padding: '8px 10px 4px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.625rem',
            }}
          >
            Sections
          </div>

          {sections.length === 0 ? (
            <div
              style={{
                padding: '12px 10px',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              No headings found
            </div>
          ) : (
            sections.map((section, i) => (
              <button
                key={`${section.startLine}-${i}`}
                onClick={() => handleScrollToSection(section)}
                title={`Line ${section.startLine + 1}: ${section.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '4px 10px',
                  paddingLeft: `${10 + (section.level - 1) * 12}px`,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.6875rem',
                  lineHeight: '1.4',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: '14px',
                    textAlign: 'center',
                    fontSize: '0.625rem',
                    opacity: 0.7,
                  }}
                >
                  {SECTION_ICONS[section.type]}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: section.level <= 2 ? 600 : 400,
                  }}
                >
                  {section.title}
                </span>
              </button>
            ))
          )}

          {/* Add Section dropdown */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.625rem',
                marginBottom: '4px',
              }}
            >
              Add Section
            </div>
            {CLAUDE_MD_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => handleInsertTemplate(tpl.content)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '3px 6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.625rem',
                  lineHeight: '1.5',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }}
              >
                + {tpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Center — the actual editor */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <InlineEditor
            ref={editorRef}
            content={content}
            filePath={filePath}
            themeId={themeId}
            projectRoot={projectRoot}
            onSave={handleSave}
            onDirtyChange={handleDirtyChange}
          />
        </div>

        {/* Right panel — template library (collapsible) */}
        {showTemplates && (
          <div
            style={{
              width: '240px',
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              backgroundColor: 'var(--bg)',
              overflow: 'auto',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.6875rem',
            }}
          >
            <div
              style={{
                padding: '8px 10px 4px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.625rem',
              }}
            >
              Template Library
            </div>
            {CLAUDE_MD_TEMPLATES.map((tpl) => (
              <div
                key={tpl.name}
                style={{
                  margin: '6px 8px',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '4px',
                    fontSize: '0.6875rem',
                  }}
                >
                  {tpl.name}
                </div>
                <pre
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.5625rem',
                    lineHeight: '1.4',
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                    margin: '0 0 6px',
                    maxHeight: '80px',
                    overflow: 'hidden',
                  }}
                >
                  {tpl.content.slice(0, 200)}
                </pre>
                <button
                  onClick={() => handleInsertTemplate(tpl.content)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-ui)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--bg)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                  }}
                >
                  Insert
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
