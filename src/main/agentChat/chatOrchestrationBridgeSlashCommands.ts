/**
 * chatOrchestrationBridgeSlashCommands.ts — Slash-command dispatcher for the
 * chat orchestration bridge.
 *
 * Wave 30 Phase C. Called from sendMessageWithBridge before the message is
 * forwarded to the orchestration layer. Returns a short-circuit result when
 * the message is a recognised slash command, or null to continue normally.
 *
 * Slash commands are identified by a leading "/" at the start of trimmed content.
 * The first word (after "/") is the command name; the remainder is the subcommand.
 *
 * Currently supported:
 *   /research <subcommand>  — see researchSlashCommands.ts
 */

import { handleResearchSlashCommand } from '../research/researchSlashCommands';
import type { AgentChatSendResult } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlashCommandContext {
  sessionId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlashResult(message: string): AgentChatSendResult {
  return { success: true, slashCommandReply: message } as AgentChatSendResult & {
    slashCommandReply: string;
  };
}

function parseSlashCommand(
  content: string,
): { command: string; subcommand: string } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('/')) return null;
  const withoutSlash = trimmed.slice(1);
  const spaceIdx = withoutSlash.indexOf(' ');
  if (spaceIdx === -1) {
    return { command: withoutSlash.toLowerCase(), subcommand: '' };
  }
  return {
    command: withoutSlash.slice(0, spaceIdx).toLowerCase(),
    subcommand: withoutSlash.slice(spaceIdx + 1),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to handle `content` as a slash command.
 *
 * Returns an `AgentChatSendResult` (with `slashCommandReply` set) when the
 * command is handled, or `null` when the message should proceed to the
 * orchestration layer normally.
 */
export function dispatchSlashCommand(
  content: string,
  ctx: SlashCommandContext,
): AgentChatSendResult | null {
  const parsed = parseSlashCommand(content);
  if (!parsed) return null;

  if (parsed.command === 'research') {
    const result = handleResearchSlashCommand(ctx.sessionId, parsed.subcommand);
    if (result.handled) return buildSlashResult(result.message);
  }

  return null;
}
