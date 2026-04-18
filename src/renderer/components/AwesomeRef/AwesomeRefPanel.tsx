/**
 * AwesomeRefPanel.tsx — "Awesome Ouroboros" in-app reference panel.
 *
 * Wave 37 Phase E. Orchestrates search/filter, entry list, install actions,
 * and hook-instructions modal. Command palette entry: awesome-ref:open →
 * dispatches agent-ide:open-awesome-ref. Mobile path wraps in MobileBottomSheet.
 *
 * Sub-components:
 *   AwesomeSearchFilter  — search input + category chips
 *   AwesomeEntryCard     — single entry row
 *   useAwesomeFilter     — filter state hook
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AwesomeEntry } from '../../awesomeRef/awesomeData';
import { useToastContext } from '../../contexts/ToastContext';
import { OPEN_AWESOME_REF_EVENT } from '../../hooks/appEventNames';
import { MobileBottomSheet } from '../Layout/MobileBottomSheet';
import { AwesomeEntryCard } from './AwesomeEntryCard';
import { AwesomeSearchFilter } from './AwesomeSearchFilter';
import { useAwesomeFilter } from './useAwesomeFilter';

// ── Install handler ───────────────────────────────────────────────────────────

function useInstallEntry(): {
  install: (entry: AwesomeEntry) => Promise<void>;
  hookEntry: AwesomeEntry | null;
  clearHookEntry: () => void;
} {
  const { toast } = useToastContext();
  const [hookEntry, setHookEntry] = useState<AwesomeEntry | null>(null);

  const install = useCallback(async (entry: AwesomeEntry) => {
    if (!entry.installAction) return;

    if (entry.installAction.kind === 'hook') {
      setHookEntry(entry);
      return;
    }

    const api = window.electronAPI?.rulesAndSkills;
    if (!api) { toast('IPC not available', 'error'); return; }

    const { kind, payload } = entry.installAction;
    const name = String(payload.name ?? entry.id);
    const content = entry.content;

    try {
      const result = kind === 'rule'
        ? await api.createRuleFile({ scope: 'global', name, content })
        : await api.createCommand({ scope: 'global', name, content });

      if (result.success) {
        toast(`"${entry.title}" installed.`, 'success');
      } else {
        toast(result.error ?? 'Install failed', 'error');
      }
    } catch {
      toast('Install failed', 'error');
    }
  }, [toast]);

  return { install, hookEntry, clearHookEntry: () => setHookEntry(null) };
}

// ── Hook instructions modal ───────────────────────────────────────────────────

interface HookInstructionsProps {
  entry: AwesomeEntry;
  onClose: () => void;
}

function HookInstructionsBody({ eventType }: { eventType: string }): React.ReactElement {
  const mono = 'font-mono text-xs bg-surface-inset px-1 rounded';
  return (
    <div className="flex-1 overflow-y-auto p-4 text-sm text-text-semantic-secondary space-y-3">
      <p>Hook scripts must be placed manually because the target directory varies per user.</p>
      <ol className="list-decimal list-inside space-y-1.5 text-text-semantic-primary">
        <li>Copy the content using the <strong>Copy</strong> button on the card.</li>
        <li>
          Save it as a <code className={mono}>.sh</code> file
          {' '}inside <code className={mono}>{'~/.claude/hooks/'}{eventType}/</code>
        </li>
        <li>Make it executable: <code className={mono}>chmod +x &lt;file&gt;.sh</code></li>
        <li>Verify in Claude Code settings → Hooks.</li>
      </ol>
      <p className="text-text-semantic-muted text-xs">
        See the Claude Code docs for the full hooks reference.
      </p>
    </div>
  );
}

function HookInstructions({ entry, onClose }: HookInstructionsProps): React.ReactElement {
  const eventType = String(entry.installAction?.payload?.eventType ?? 'PostToolUse');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hook install instructions"
      className="fixed inset-0 z-60 flex items-center justify-center bg-surface-overlay/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[480px] max-h-[70vh] flex flex-col rounded-lg shadow-lg border border-border-subtle bg-surface-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-text-semantic-primary font-medium text-sm">
            Installing: {entry.title}
          </span>
          <button onClick={onClose} aria-label="Close instructions"
            className="text-text-semantic-muted hover:text-text-semantic-primary text-lg leading-none">
            ×
          </button>
        </div>
        <HookInstructionsBody eventType={eventType} />
        <div className="px-4 py-3 border-t border-border-subtle flex justify-end">
          <button onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-interactive-accent text-text-on-accent hover:bg-interactive-hover transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-10 text-text-semantic-muted text-sm">
      No entries match your search.
    </div>
  );
}

// ── Panel body ────────────────────────────────────────────────────────────────

interface AwesomeRefPanelBodyProps {
  onClose: () => void;
}

function AwesomeRefPanelBody({ onClose }: AwesomeRefPanelBodyProps): React.ReactElement {
  const { filtered, query, category, setQuery, setCategory } = useAwesomeFilter();
  const { install, hookEntry, clearHookEntry } = useInstallEntry();

  return (
    <div className="flex flex-col h-full bg-surface-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-text-semantic-primary font-medium text-sm">
          Awesome Ouroboros
        </span>
        <button
          onClick={onClose}
          aria-label="Close Awesome Ouroboros"
          className="text-text-semantic-muted hover:text-text-semantic-primary text-lg leading-none"
        >
          ×
        </button>
      </div>

      <AwesomeSearchFilter
        query={query}
        category={category}
        onQueryChange={setQuery}
        onCategoryChange={setCategory}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 && <EmptyState />}
        {filtered.map((entry) => (
          <AwesomeEntryCard key={entry.id} entry={entry} onInstall={install} />
        ))}
      </div>

      {hookEntry && (
        <HookInstructions entry={hookEntry} onClose={clearHookEntry} />
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export interface AwesomeRefPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AwesomeRefPanel({ isOpen, onClose }: AwesomeRefPanelProps): React.ReactElement | null {
  if (!isOpen) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (isMobile) {
    return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} ariaLabel="Awesome Ouroboros">
        <AwesomeRefPanelBody onClose={onClose} />
      </MobileBottomSheet>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Awesome Ouroboros"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[560px] max-h-[75vh] flex flex-col rounded-lg shadow-lg overflow-hidden border border-border-subtle bg-surface-panel">
        <AwesomeRefPanelBody onClose={onClose} />
      </div>
    </div>
  );
}

// ── DOM event listener hook (for command palette integration) ─────────────────

export function useAwesomeRefPanelEvent(open: () => void): void {
  useEffect(() => {
    const handler = () => open();
    window.addEventListener(OPEN_AWESOME_REF_EVENT, handler);
    return () => window.removeEventListener(OPEN_AWESOME_REF_EVENT, handler);
  }, [open]);
}
