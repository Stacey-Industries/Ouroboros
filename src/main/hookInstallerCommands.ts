/**
 * hookInstallerCommands.ts — Builds the hook command map for all 27 Claude Code events.
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

/** Maps each generic event to its generic_hook script command for the current platform. */
function buildGenericHookEntries(hooksDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, wireType] of GENERIC_EVENTS) {
    if (process.platform === 'win32') {
      const script = path.join(hooksDir, 'generic_hook.ps1');
      // eslint-disable-next-line security/detect-object-injection -- key from fixed constant array above
      result[key] =
        `powershell -ExecutionPolicy Bypass -NonInteractive -File "${script}" --type ${wireType}`;
    } else {
      const script = path.join(hooksDir, 'generic_hook.sh');
      // eslint-disable-next-line security/detect-object-injection -- key from fixed constant array above
      result[key] = `${script} --type ${wireType}`;
    }
  }
  return result;
}

/** Builds the full hook command map for all 27 Claude Code hook events. */
export function buildHookCommands(hooksDir: string): Record<string, string> {
  const generic = buildGenericHookEntries(hooksDir);

  if (process.platform === 'win32') {
    const ps = (script: string) =>
      `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, script)}"`;
    return {
      PreToolUse: ps('pre_tool_use.ps1'),
      PostToolUse: ps('post_tool_use.ps1'),
      SubagentStart: ps('agent_start.ps1'),
      SubagentStop: ps('agent_end.ps1'),
      SessionStart: ps('session_start.ps1'),
      Stop: ps('session_stop.ps1'),
      InstructionsLoaded: ps('instructions_loaded.ps1'),
      ...generic,
    };
  }

  return {
    PreToolUse: path.join(hooksDir, 'pre_tool_use.sh'),
    PostToolUse: path.join(hooksDir, 'post_tool_use.sh'),
    SubagentStart: path.join(hooksDir, 'agent_start.sh'),
    SubagentStop: path.join(hooksDir, 'agent_end.sh'),
    SessionStart: path.join(hooksDir, 'session_start.sh'),
    Stop: path.join(hooksDir, 'session_stop.sh'),
    InstructionsLoaded: path.join(hooksDir, 'instructions_loaded.sh'),
    ...generic,
  };
}
