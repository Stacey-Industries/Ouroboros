/**
 * WorkspaceVariantContext — shared context for the active workspace variant.
 *
 * Wave 43 Phase C: extracted into its own module to avoid a circular import
 * between AgentChatWorkspace (provider) and AgentChatComposerParts (consumer).
 *
 * Variant rule: new variant-specific behaviour MUST motivate its own prop or
 * context — do not add cases to WorkspaceVariant without a clear motivation.
 */

import { createContext, useContext } from 'react';

/**
 * 'ide' (default): all features active — SideChatDrawer, BranchCompareModal, composer chips.
 * 'chat-only': SideChatDrawer and BranchCompareModal not mounted; composer chips suppressed
 *   (they live in ChatOnlyHeaderControls instead).
 */
export type WorkspaceVariant = 'ide' | 'chat-only';

export const WorkspaceVariantContext = createContext<WorkspaceVariant>('ide');

export const useWorkspaceVariant = (): WorkspaceVariant => useContext(WorkspaceVariantContext);
