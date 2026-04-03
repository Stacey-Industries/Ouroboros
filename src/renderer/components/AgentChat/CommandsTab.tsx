import React, { useCallback, useState } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';
import { CommandItem, InlineCreateForm, ScopeToggle, type ScopeValue } from './ClaudeConfigPanelParts';

// ── Props ──────────────────────────────────────────────────────────────────

export interface CommandsTabProps {
  commands: CommandDefinition[];
  onOpenFile: (filePath: string) => void;
  projectRoot: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hasAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && 'rulesAndSkills' in window.electronAPI;
}

function scopeToClaudeScope(scope: ScopeValue): 'global' | 'project' {
  return scope === 'global' ? 'global' : 'project';
}

function filterByScope(commands: CommandDefinition[], scope: ScopeValue): CommandDefinition[] {
  const match = scope === 'global' ? 'user' : 'project';
  return commands.filter((cmd) => cmd.scope === match);
}

const DEFAULT_TEMPLATE = '$ARGUMENTS\n';

// ── IPC handlers ───────────────────────────────────────────────────────────

function useCommandCreate(
  scope: ScopeValue,
  projectRoot: string | null,
  onOpenFile: (filePath: string) => void,
): (name: string) => void {
  return useCallback(
    (name: string) => {
      if (!hasAPI()) return;
      void window.electronAPI.rulesAndSkills
        .createCommand({
          scope: scopeToClaudeScope(scope),
          name,
          content: DEFAULT_TEMPLATE,
          projectRoot: projectRoot ?? undefined,
        })
        .then((result) => {
          if (result.success && result.filePath) {
            onOpenFile(result.filePath);
          }
        });
    },
    [scope, projectRoot, onOpenFile],
  );
}

function useCommandDelete(scope: ScopeValue, projectRoot: string | null): (id: string) => void {
  return useCallback(
    (id: string) => {
      if (!hasAPI()) return;
      void window.electronAPI.rulesAndSkills.deleteCommand({
        scope: scopeToClaudeScope(scope),
        name: id,
        projectRoot: projectRoot ?? undefined,
      });
    },
    [scope, projectRoot],
  );
}

// ── List section ───────────────────────────────────────────────────────────

function CommandList({
  commands,
  onOpen,
  onDelete,
}: {
  commands: CommandDefinition[];
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
}): React.ReactElement {
  if (commands.length === 0) {
    return (
      <div className="px-3 py-1.5 text-[10px] text-text-semantic-muted">No commands found</div>
    );
  }
  return (
    <>
      {commands.map((cmd) => (
        <CommandItem key={`${cmd.scope}:${cmd.id}`} command={cmd} onOpen={onOpen} onDelete={onDelete} />
      ))}
    </>
  );
}

// ── Tab root ───────────────────────────────────────────────────────────────

export function CommandsTab({
  commands,
  onOpenFile,
  projectRoot,
}: CommandsTabProps): React.ReactElement {
  const [scope, setScope] = useState<ScopeValue>('global');

  const filtered = filterByScope(commands, scope);
  const handleCreate = useCommandCreate(scope, projectRoot, onOpenFile);
  const handleDelete = useCommandDelete(scope, projectRoot);

  const onDelete = useCallback(
    (id: string) => handleDelete(id),
    [handleDelete],
  );

  return (
    <div className="flex flex-col gap-0">
      <ScopeToggle scope={scope} onScopeChange={setScope} />
      <CommandList commands={filtered} onOpen={onOpenFile} onDelete={onDelete} />
      <InlineCreateForm onCreate={handleCreate} placeholder="+ New Command" />
    </div>
  );
}
