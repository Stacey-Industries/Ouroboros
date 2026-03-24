import React, { useState } from 'react';

import { ToolDetails, ToolHeader } from './AgentChatToolCardSupport';

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
  status: 'running' | 'complete' | 'error';
  filePath?: string;
  inputSummary?: string;
  editSummary?: { oldLines: number; newLines: number };
}

export interface AgentChatToolCardProps {
  name: string;
  status: 'running' | 'complete' | 'error';
  filePath?: string;
  isCollapsed?: boolean;
  /** Tool input for preview (optional, from structured content blocks) */
  input?: unknown;
  /** Execution duration in seconds (optional) */
  duration?: number;
  /** Error output when tool failed (optional) */
  errorOutput?: string;
  /** Short summary of the tool input (command, pattern, etc.) from streaming */
  inputSummary?: string;
  /** Edit change summary from streaming (line counts) */
  editSummary?: { oldLines: number; newLines: number };
}

export function ChevronIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 text-text-semantic-muted transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? parts.join('/') : parts.slice(-2).join('/');
}

function isFileModifyingTool(name: string): boolean {
  return FILE_MODIFYING_TOOLS.has(name);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function getCommandPreview(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' ? truncate(command, 120) : null;
}

function getFilePreview(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  const filePath = obj.file_path ?? obj.filePath ?? obj.path;
  return typeof filePath === 'string' ? filePath : null;
}

function formatInputPreview(name: string, input: unknown): string | null {
  if (input == null) return null;
  const commandPreview =
    name === 'Bash' || name === 'execute_command' ? getCommandPreview(input) : null;
  if (commandPreview) return commandPreview;
  const filePreview = getFilePreview(input);
  if (filePreview) return filePreview;
  try {
    const serialized = JSON.stringify(input);
    return serialized ? truncate(serialized, 100) : null;
  } catch {
    return null;
  }
}

interface ToolCardState {
  collapsed: boolean;
  errorExpanded: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setErrorExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  showDiffPreview: boolean;
  displaySummary: string | null;
  headerDetail: string | null;
}

function useToolCardState(props: AgentChatToolCardProps): ToolCardState {
  const {
    name,
    status,
    filePath,
    isCollapsed: initialCollapsed = true,
    input,
    inputSummary,
  } = props;
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const showDiffPreview = isFileModifyingTool(name) && status === 'complete';
  const inputPreview = formatInputPreview(name, input);
  const displaySummary = inputPreview || inputSummary || null;
  const headerDetail = filePath
    ? shortenPath(filePath)
    : inputSummary
      ? truncate(inputSummary, 60)
      : null;
  return {
    collapsed,
    errorExpanded,
    setCollapsed,
    setErrorExpanded,
    showDiffPreview,
    displaySummary,
    headerDetail,
  };
}

function ToolCardBody(
  props: AgentChatToolCardProps & ReturnType<typeof useToolCardState>,
): React.ReactElement {
  return (
    <div
      className={`my-1.5 rounded-md border text-xs glass-card bg-surface-raised ${props.errorOutput ? '' : 'border-border-semantic'}`}
      style={props.errorOutput ? { borderColor: 'rgba(248, 81, 73, 0.3)' } : undefined}
    >
      <ToolHeader
        name={props.name}
        status={props.status}
        headerDetail={props.headerDetail}
        editSummary={props.editSummary}
        duration={props.duration}
        collapsed={props.collapsed}
        onToggle={() => props.setCollapsed((prev) => !prev)}
        ChevronIconComponent={ChevronIcon}
      />
      {!props.collapsed && (
        <ToolDetails
          filePath={props.filePath}
          displaySummary={props.displaySummary}
          editSummary={props.editSummary}
          showDiffPreview={props.showDiffPreview}
          errorOutput={props.errorOutput}
          status={props.status}
          errorExpanded={props.errorExpanded}
          onToggleErrorExpanded={() => props.setErrorExpanded((prev) => !prev)}
          ChevronIconComponent={ChevronIcon}
        />
      )}
    </div>
  );
}

export const AgentChatToolCard = React.memo(function AgentChatToolCard(
  props: AgentChatToolCardProps,
): React.ReactElement {
  const state = useToolCardState(props);
  return <ToolCardBody {...props} {...state} />;
});
