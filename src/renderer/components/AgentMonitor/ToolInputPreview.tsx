/**
 * ToolInputPreview.tsx — Preview of tool input for approval dialog.
 */

import React from 'react';

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (typeof input[key] === 'string') return input[key] as string;
  }
  return null;
}

const PRE_STYLE = {
  maxHeight: '200px',
  overflow: 'auto' as const,
};

function CodeBlock({
  text,
  bg,
  borderColor,
}: {
  text: string;
  bg: string;
  borderColor: string;
}): React.ReactElement {
  return (
    <pre
      className="mt-1 p-2 rounded text-xs font-mono whitespace-pre-wrap text-text-semantic-primary"
      style={{ backgroundColor: bg, border: `1px solid ${borderColor}`, ...PRE_STYLE }}
    >
      {text}
    </pre>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n... (truncated)' : s;
}

// ─── Main component ──────────────────────────────────────────────────────────

interface ToolInputPreviewProps {
  toolName: string;
  input: Record<string, unknown>;
}

export function ToolInputPreview({ toolName, input }: ToolInputPreviewProps): React.ReactElement {
  const filePath = extractString(input, ['file_path', 'filePath', 'path']);
  const command = extractString(input, ['command']);
  const content = extractString(input, ['content', 'new_string', 'newString']);
  const oldString = extractString(input, ['old_string', 'oldString']);
  const isEdit = toolName === 'Edit' || toolName === 'edit';

  return (
    <div className="flex flex-col gap-2 text-sm" style={{ maxHeight: '400px', overflow: 'auto' }}>
      {filePath && <FilePathRow filePath={filePath} />}
      {command && <CommandRow command={command} />}
      {oldString && isEdit && <OldStringRow oldString={oldString} />}
      {content && <ContentRow content={content} isEdit={isEdit} />}
      {!filePath && !command && !content && <FallbackRow input={input} />}
    </div>
  );
}

function FilePathRow({ filePath }: { filePath: string }): React.ReactElement {
  return (
    <div>
      <span className="font-semibold text-text-semantic-muted">File: </span>
      <span className="font-mono text-xs text-interactive-accent">{filePath}</span>
    </div>
  );
}

function CommandRow({ command }: { command: string }): React.ReactElement {
  return (
    <div>
      <span className="font-semibold text-text-semantic-muted">Command: </span>
      <CodeBlock
        text={command}
        bg="var(--bg-deeper, rgba(0,0,0,0.3))"
        borderColor="var(--border-default)"
      />
    </div>
  );
}

function OldStringRow({ oldString }: { oldString: string }): React.ReactElement {
  return (
    <div>
      <span className="font-semibold text-text-semantic-muted">Replacing: </span>
      <CodeBlock
        text={truncate(oldString, 500)}
        bg="rgba(255, 80, 80, 0.1)"
        borderColor="rgba(255, 80, 80, 0.3)"
      />
    </div>
  );
}

function ContentRow({ content, isEdit }: { content: string; isEdit: boolean }): React.ReactElement {
  return (
    <div>
      <span className="font-semibold text-text-semantic-muted">
        {isEdit ? 'With:' : 'Content:'}
      </span>
      <CodeBlock
        text={truncate(content, 1000)}
        bg="rgba(80, 200, 80, 0.1)"
        borderColor="rgba(80, 200, 80, 0.3)"
      />
    </div>
  );
}

function FallbackRow({ input }: { input: Record<string, unknown> }): React.ReactElement {
  return (
    <CodeBlock
      text={JSON.stringify(input, null, 2)}
      bg="var(--bg-deeper, rgba(0,0,0,0.3))"
      borderColor="var(--border-default)"
    />
  );
}
