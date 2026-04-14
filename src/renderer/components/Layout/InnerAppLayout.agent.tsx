/**
 * InnerAppLayout.agent.tsx — AgentSidebarContent and its ChatErrorBoundary.
 * Extracted from InnerAppLayout.tsx to keep that file under 300 lines.
 *
 * NOTE: ChatErrorBoundary is kept in the same module as AgentSidebarContent
 * (not imported from shared) because Vite HMR can fail to resolve shared modules
 * exactly when a crash recovery is needed.
 */

import React, { type ErrorInfo, useCallback, useReducer } from 'react';

import { useRulesAndSkills } from '../../hooks/useRulesAndSkills';
import { AgentChatWorkspace } from '../AgentChat/AgentChatWorkspace';
import { ClaudeConfigPanel } from '../AgentChat/ClaudeConfigPanel';
import { SessionMemoryPanel } from '../AgentChat/SessionMemoryPanel';
import type { AgentChatWorkspaceModel } from '../AgentChat/useAgentChatWorkspace';
import { GitPanel } from '../GitPanel';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { LazyPanelFallback } from './LazyPanelFallback';
import { RightSidebarTabs } from './RightSidebarTabs';

const AgentMonitorManager = React.lazy(() =>
  import('../AgentMonitor').then((m) => ({ default: m.AgentMonitorManager })),
);
const AnalyticsDashboard = React.lazy(() =>
  import('../Analytics').then((m) => ({ default: m.AnalyticsDashboard })),
);

// ── ChatErrorBoundary ─────────────────────────────────────────────────────────

class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ChatErrorBoundary] caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-6 text-center text-text-semantic-muted"
          style={{ minHeight: 120 }}
        >
          <span className="text-sm font-medium text-status-error">Chat crashed</span>
          <span className="text-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </span>
          <button
            className="mt-1 rounded px-3 py-1 text-xs bg-surface-raised border border-border-semantic text-text-semantic-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useAgentSidebarModel(): {
  chatModel: AgentChatWorkspaceModel | null;
  handleModelReady: (model: AgentChatWorkspaceModel) => void;
} {
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  const modelRef = React.useRef<AgentChatWorkspaceModel | null>(null);
  const handleModelReady = useCallback((model: AgentChatWorkspaceModel) => {
    const prev = modelRef.current;
    const threadsChanged = prev?.threads !== model.threads;
    const activeChanged = prev?.activeThreadId !== model.activeThreadId;
    modelRef.current = model;
    if (threadsChanged || activeChanged || !prev) forceRender();
  }, []);
  return { chatModel: modelRef.current, handleModelReady };
}

function AnalyticsSuspense(): React.ReactElement {
  return (
    <ErrorBoundary label="Analytics">
      <React.Suspense fallback={<LazyPanelFallback />}>
        <AnalyticsDashboard />
      </React.Suspense>
    </ErrorBoundary>
  );
}

// ── AgentSidebarContent ───────────────────────────────────────────────────────

function openFileInEditor(filePath: string): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { filePath } }));
}
function openSettings(tab?: string): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-settings', tab ? { detail: tab } : undefined));
}

export function AgentSidebarContent({ projectRoot }: { projectRoot: string | null }): React.ReactElement {
  const { chatModel, handleModelReady } = useAgentSidebarModel();
  const { rules, commands, isLoading, createRule } = useRulesAndSkills(projectRoot);
  const handleOpenFile = useCallback((f: string) => openFileInEditor(f), []);
  const handleOpenHooks = useCallback(() => openSettings('hooks'), []);
  const handleCreateRule = useCallback(async (type: 'claude-md' | 'agents-md') => { const fp = await createRule(type); if (fp) openFileInEditor(fp); }, [createRule]);
  return (
    <RightSidebarTabs
      chatContent={<ChatErrorBoundary><AgentChatWorkspace projectRoot={projectRoot} onModelReady={handleModelReady} /></ChatErrorBoundary>}
      monitorContent={<ErrorBoundary label="Agent Monitor"><React.Suspense fallback={<LazyPanelFallback />}><AgentMonitorManager /></React.Suspense></ErrorBoundary>}
      gitContent={<ErrorBoundary label="Git Panel"><GitPanel /></ErrorBoundary>}
      analyticsContent={<AnalyticsSuspense />}
      memoryContent={<ErrorBoundary label="Memory"><SessionMemoryPanel workspaceRoot={projectRoot} /></ErrorBoundary>}
      rulesContent={<ErrorBoundary label="Claude Config"><ClaudeConfigPanel rules={rules} commands={commands} isLoading={isLoading} onOpenFile={handleOpenFile} onCreateRule={handleCreateRule} onOpenHooksSettings={handleOpenHooks} projectRoot={projectRoot} /></ErrorBoundary>}
      threads={chatModel?.threads}
      activeThreadId={chatModel?.activeThreadId}
      onSelectThread={chatModel?.selectThread}
      onDeleteThread={chatModel ? (id) => void chatModel.deleteThread(id) : undefined}
      onNewChat={chatModel?.startNewChat}
    />
  );
}
