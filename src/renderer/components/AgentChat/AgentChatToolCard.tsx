import React, { useState } from 'react';
import { formatToolActivity } from './agentChatFormatters';
import { AgentChatDiffPreview } from './AgentChatDiffPreview';

const FILE_MODIFYING_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'write_file',
  'edit_file',
  'multi_edit',
  'NotebookEdit',
  'create_file',
]);

export interface ToolActivity {
  name: string;
  status: 'running' | 'complete';
  filePath?: string;
}

export interface AgentChatToolCardProps {
  name: string;
  status: 'running' | 'complete';
  filePath?: string;
  isCollapsed?: boolean;
  /** Tool input for preview (optional, from structured content blocks) */
  input?: unknown;
  /** Execution duration in seconds (optional) */
  duration?: number;
  /** Error output when tool failed (optional) */
  errorOutput?: string;
}

function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: 'var(--accent)' }}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: 'var(--accent)' }}
    >
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: 'var(--text-muted)' }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolIcon({ name }: { name: string }): React.ReactElement {
  const svgProps = {
    className: 'h-3.5 w-3.5 shrink-0',
    viewBox: '0 0 14 14',
    fill: 'none',
    style: { color: 'var(--text-muted)' } as React.CSSProperties,
  };
  const strokeProps = {
    stroke: 'currentColor',
    strokeWidth: '1.5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  // Read / read_file
  if (name === 'Read' || name === 'read_file') {
    return (
      <svg {...svgProps}>
        <path d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z" {...strokeProps} />
        <path d="M5 5.5h4M5 8h3" {...strokeProps} />
      </svg>
    );
  }

  // Edit / edit_file / MultiEdit / multi_edit
  if (name === 'Edit' || name === 'edit_file' || name === 'MultiEdit' || name === 'multi_edit') {
    return (
      <svg {...svgProps}>
        <path d="M8.5 2l3 3-7.5 7.5H1v-3L8.5 2z" {...strokeProps} />
      </svg>
    );
  }

  // Write / write_file / create_file
  if (name === 'Write' || name === 'write_file' || name === 'create_file') {
    return (
      <svg {...svgProps}>
        <path d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z" {...strokeProps} />
        <path d="M7 5v4M5 7h4" {...strokeProps} />
      </svg>
    );
  }

  // Bash / execute_command
  if (name === 'Bash' || name === 'execute_command') {
    return (
      <svg {...svgProps}>
        <rect x="1" y="2" width="12" height="10" rx="1.5" {...strokeProps} />
        <path d="M3.5 5.5l2 1.5-2 1.5M7 9h3" {...strokeProps} />
      </svg>
    );
  }

  // Grep / search_files
  if (name === 'Grep' || name === 'search_files') {
    return (
      <svg {...svgProps}>
        <circle cx="6" cy="6" r="4" {...strokeProps} />
        <path d="M9.5 9.5l3 3" {...strokeProps} />
      </svg>
    );
  }

  // Glob / find_files
  if (name === 'Glob' || name === 'find_files') {
    return (
      <svg {...svgProps}>
        <path d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h5a1 1 0 011 1v6a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-6.5z" {...strokeProps} />
        <circle cx="8" cy="7.5" r="2" {...strokeProps} />
      </svg>
    );
  }

  // WebSearch
  if (name === 'WebSearch') {
    return (
      <svg {...svgProps}>
        <circle cx="7" cy="7" r="5.5" {...strokeProps} />
        <path d="M1.5 7h11M7 1.5c-2 2-2 9 0 11M7 1.5c2 2 2 9 0 11" {...strokeProps} />
      </svg>
    );
  }

  // WebFetch
  if (name === 'WebFetch') {
    return (
      <svg {...svgProps}>
        <path d="M7 2v7M4 6l3 3 3-3" {...strokeProps} />
        <path d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10" {...strokeProps} />
      </svg>
    );
  }

  // TodoWrite
  if (name === 'TodoWrite') {
    return (
      <svg {...svgProps}>
        <rect x="2" y="1.5" width="10" height="11" rx="1" {...strokeProps} />
        <path d="M4.5 5l1 1 2-2M4.5 9h5" {...strokeProps} />
      </svg>
    );
  }

  // NotebookEdit
  if (name === 'NotebookEdit') {
    return (
      <svg {...svgProps}>
        <rect x="2.5" y="1" width="9" height="12" rx="1" {...strokeProps} />
        <path d="M5 1v12M5 4.5h5M5 7.5h5" {...strokeProps} />
      </svg>
    );
  }

  // Default: wrench
  return (
    <svg {...svgProps}>
      <path d="M9.5 1.5a4 4 0 00-4.5 4.5L1.5 9.5 4 12l3.5-3.5a4 4 0 004.5-4.5L9.5 6.5 7 4l2.5-2.5z" {...strokeProps} />
    </svg>
  );
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return parts.join('/');
  return parts.slice(-2).join('/');
}

function isFileModifyingTool(name: string): boolean {
  return FILE_MODIFYING_TOOLS.has(name);
}

/** Format a truncated input preview for display */
function formatInputPreview(name: string, input: unknown): string | null {
  if (input == null) return null;

  // Bash/execute_command: show the command string
  if ((name === 'Bash' || name === 'execute_command') && typeof input === 'object') {
    const cmd = (input as Record<string, unknown>).command;
    if (typeof cmd === 'string') {
      return cmd.length > 120 ? cmd.slice(0, 117) + '...' : cmd;
    }
  }

  // Read/Edit/Write: show file_path
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const fp = obj.file_path ?? obj.filePath ?? obj.path;
    if (typeof fp === 'string') return fp;
  }

  // Generic fallback: stringify and truncate
  try {
    const str = JSON.stringify(input);
    return str.length > 100 ? str.slice(0, 97) + '...' : str;
  } catch {
    return null;
  }
}

export function AgentChatToolCard({
  name,
  status,
  filePath,
  isCollapsed: initialCollapsed = true,
  input,
  duration,
  errorOutput,
}: AgentChatToolCardProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const showDiffPreview = isFileModifyingTool(name) && status === 'complete';

  const inputPreview = formatInputPreview(name, input);

  return (
    <div
      className="my-1.5 rounded-md border text-xs"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: errorOutput ? 'rgba(248, 81, 73, 0.3)' : 'var(--border)',
      }}
    >
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-100 hover:opacity-80"
      >
        <ToolIcon name={name} />
        {status === 'running' ? <SpinnerIcon /> : <CheckIcon />}
        <span
          className="truncate"
          style={{ color: 'var(--text)', fontFamily: 'var(--font-ui)' }}
        >
          {formatToolActivity(name)}
        </span>
        {filePath && (
          <span className="truncate text-[10px] ml-1 max-w-[40%]" style={{ color: 'var(--text-muted)' }}>
            {shortenPath(filePath)}
          </span>
        )}
        {duration != null && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
            {duration < 1 ? `${Math.round(duration * 1000)}ms` : `${duration.toFixed(1)}s`}
          </span>
        )}
        {errorOutput && (
          <span className="text-[10px] shrink-0 font-medium" style={{ color: 'var(--error, #f85149)' }}>
            error
          </span>
        )}
        <span className="flex-1" />
        <ChevronIcon collapsed={collapsed} />
      </button>
      {!collapsed && (
        <div
          className="border-t px-2.5 py-2"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
          }}
        >
          <div>Tool: {name}</div>
          {filePath && (
            <div className="mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              File: {filePath}
            </div>
          )}
          {inputPreview && !filePath && (
            <div className="mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {inputPreview}
            </div>
          )}
          {showDiffPreview && filePath && (
            <AgentChatDiffPreview filePath={filePath} />
          )}
          {errorOutput && (
            <div className="mt-1.5">
              <button
                onClick={() => setErrorExpanded((e) => !e)}
                className="flex items-center gap-1 text-[10px] font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--error, #f85149)' }}
              >
                <ChevronIcon collapsed={!errorExpanded} />
                Error Output
              </button>
              {errorExpanded && (
                <pre
                  className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap rounded p-2 text-[10px]"
                  style={{
                    backgroundColor: 'rgba(248, 81, 73, 0.06)',
                    color: 'var(--error, #f85149)',
                    border: '1px solid rgba(248, 81, 73, 0.2)',
                  }}
                >
                  {errorOutput}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
