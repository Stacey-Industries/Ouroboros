/**
 * hookInstallerCommands.ts — Builds the hook command map for all 27 Claude Code events.
 *
 * Cross-platform: emits `node "<path>.mjs"` commands universally. Replaces the
 * earlier .ps1 vs .sh platform branching after the 2026-04-26 Node migration.
 *
 * Split from hookInstaller.ts to keep each file under the 300-line ESLint limit.
 */

import path from 'path';

// ─── Generic event table ──────────────────────────────────────────────────────
// PascalCase event name → wire format type string used as --type argument.

const GENERIC_EVENTS: Array<[string, string]> = [
  ['SessionEnd', 'session_end'],
  ['StopFailure', 'stop_failure'],
  ['Setup', 'setup'],
  ['PostToolUseFailure', 'post_tool_use_failure'],
  ['TeammateIdle', 'teammate_idle'],
  ['TaskCreated', 'task_created'],
  ['TaskCompleted', 'task_completed'],
  ['UserPromptSubmit', 'user_prompt_submit'],
  ['Elicitation', 'elicitation'],
  ['ElicitationResult', 'elicitation_result'],
  ['Notification', 'notification'],
  ['CwdChanged', 'cwd_changed'],
  ['FileChanged', 'file_changed'],
  ['WorktreeCreate', 'worktree_create'],
  ['WorktreeRemove', 'worktree_remove'],
  ['ConfigChange', 'config_change'],
  ['PreCompact', 'pre_compact'],
  ['PostCompact', 'post_compact'],
  ['PermissionRequest', 'permission_request'],
  ['PermissionDenied', 'permission_denied'],
];

function nodeCommand(scriptPath: string, extraArgs = ''): string {
  return `node "${scriptPath}"${extraArgs ? ' ' + extraArgs : ''}`;
}

/** Maps each generic event to its generic_hook script command. */
function buildGenericHookEntries(hooksDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const script = path.join(hooksDir, 'generic_hook.mjs');
  for (const [key, wireType] of GENERIC_EVENTS) {
    // eslint-disable-next-line security/detect-object-injection -- key from fixed constant array above
    result[key] = nodeCommand(script, `--type ${wireType}`);
  }
  return result;
}

/** Builds the full hook command map for all 27 Claude Code hook events. */
export function buildHookCommands(hooksDir: string): Record<string, string> {
  const generic = buildGenericHookEntries(hooksDir);
  const mjs = (script: string) => nodeCommand(path.join(hooksDir, script));

  return {
    PreToolUse: mjs('pre_tool_use.mjs'),
    PostToolUse: mjs('post_tool_use.mjs'),
    SubagentStart: mjs('agent_start.mjs'),
    SubagentStop: mjs('agent_end.mjs'),
    SessionStart: mjs('session_start.mjs'),
    Stop: mjs('session_stop.mjs'),
    InstructionsLoaded: mjs('instructions_loaded.mjs'),
    ...generic,
  };
}
