/**
 * AgentChatComposer.helpers.ts — Pure prop builders extracted from
 * AgentChatComposer.tsx to keep that file under the 300-line ESLint cap.
 */
import type { AgentChatComposerProps } from './AgentChatComposer';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';

export function toMentionLabels(
  mentions: MentionItem[] | undefined,
): { estimatedTokens: number; label: string }[] {
  return (mentions ?? []).map((m) => ({ estimatedTokens: m.estimatedTokens, label: m.label }));
}

export interface BuildChatOnlyContextPreviewPropsArgs {
  composerProps: AgentChatComposerProps;
  chatOverrides: ChatOverrides | undefined;
  settingsModel: string | undefined;
  claudeSessionId: string | undefined;
  /**
   * Pre-memoized labels so the caller can produce a stable reference per
   * `composerProps.mentions`. Computing this inside would create a new array
   * each render and invalidate `useContextPreview`'s memo on every keystroke.
   */
  mentionLabels: { estimatedTokens: number; label: string }[];
  /**
   * Wave 82.1 — explicit project root from the workspace store. The popover
   * uses this for project-scoped IPCs (rule files, MCP servers, memory
   * entries). In chat-only workbench mode this is `LayoutState.activeProject`,
   * which does NOT match `ProjectContext.projectRoot` (= multi-root[0]).
   */
  projectRoot: string | null;
}

export function buildChatOnlyContextPreviewProps(args: BuildChatOnlyContextPreviewPropsArgs) {
  const {
    composerProps,
    chatOverrides,
    settingsModel,
    claudeSessionId,
    mentionLabels,
    projectRoot,
  } = args;
  return {
    pinnedFiles: composerProps.pinnedFiles,
    // Wave 82 (post-smoke): attachments now flow through to popover Files tab.
    attachments: composerProps.attachments,
    chatOverrides,
    settingsModel,
    mentionLabels,
    claudeSessionId,
    disabledLocalIds: composerProps.disabledLocalIds,
    setDisabledLocalIds: composerProps.setDisabledLocalIds,
    projectRoot,
  };
}

export function buildComposerContextBarProps(composerProps: AgentChatComposerProps) {
  return {
    streamingTokenUsage: composerProps.streamingTokenUsage,
    threadModelUsage: composerProps.threadModelUsage,
    selectedModel: composerProps.chatOverrides?.model,
    settingsModel: composerProps.settingsModel,
    codexSettingsModel: composerProps.codexSettingsModel,
    defaultProvider: composerProps.defaultProvider,
    codexModels: composerProps.codexModels,
  };
}
