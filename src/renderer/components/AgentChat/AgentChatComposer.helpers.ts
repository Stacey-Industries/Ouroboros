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

export function buildChatOnlyContextPreviewProps(
  composerProps: AgentChatComposerProps,
  chatOverrides: ChatOverrides | undefined,
  settingsModel: string | undefined,
  claudeSessionId: string | undefined,
) {
  return {
    pinnedFiles: composerProps.pinnedFiles,
    chatOverrides,
    settingsModel,
    mentionLabels: toMentionLabels(composerProps.mentions),
    claudeSessionId,
    disabledLocalIds: composerProps.disabledLocalIds,
    setDisabledLocalIds: composerProps.setDisabledLocalIds,
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
