import path from 'path';
import { describe, expect, it } from 'vitest';

import { buildHookCommands } from './hookInstallerCommands';

// The GENERIC_EVENTS array is not exported, so we verify the wire format by
// inspecting the command strings produced by buildHookCommands. Each generic
// event's command must contain the expected --type <wire_name> argument.
const EXPECTED_WIRE_MAPPINGS: Array<[string, string]> = [
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

describe('buildHookCommands', () => {
  const hooksDir = '/test/hooks';

  it('returns bespoke commands for the 7 original events', () => {
    const cmds = buildHookCommands(hooksDir);
    expect(cmds).toHaveProperty('PreToolUse');
    expect(cmds).toHaveProperty('PostToolUse');
    expect(cmds).toHaveProperty('SubagentStart');
    expect(cmds).toHaveProperty('SubagentStop');
    expect(cmds).toHaveProperty('SessionStart');
    expect(cmds).toHaveProperty('Stop');
    expect(cmds).toHaveProperty('InstructionsLoaded');
  });

  it('returns generic_hook commands for all 20 new events', () => {
    const cmds = buildHookCommands(hooksDir);
    const newEvents = [
      'SessionEnd', 'StopFailure', 'Setup', 'PostToolUseFailure', 'TeammateIdle',
      'TaskCreated', 'TaskCompleted', 'UserPromptSubmit', 'Elicitation', 'ElicitationResult',
      'Notification', 'CwdChanged', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove',
      'ConfigChange', 'PreCompact', 'PostCompact', 'PermissionRequest', 'PermissionDenied',
    ];
    for (const event of newEvents) {
      expect(cmds).toHaveProperty(event);
    }
  });

  it('returns exactly 27 hook entries', () => {
    const cmds = buildHookCommands(hooksDir);
    expect(Object.keys(cmds)).toHaveLength(27);
  });

  it('generic hook commands reference the hooksDir path', () => {
    const cmds = buildHookCommands(hooksDir);
    // Use path.join so the separator matches the current platform
    expect(cmds['TaskCreated']).toContain(path.join(hooksDir, 'generic_hook'));
    expect(cmds['TaskCreated']).toContain('task_created');
  });

  it('bespoke commands reference the correct script files', () => {
    const cmds = buildHookCommands(hooksDir);
    if (process.platform === 'win32') {
      expect(cmds['PreToolUse']).toContain('pre_tool_use.ps1');
      expect(cmds['Stop']).toContain('session_stop.ps1');
      expect(cmds['SubagentStop']).toContain('agent_end.ps1');
    } else {
      expect(cmds['PreToolUse']).toBe(path.join(hooksDir, 'pre_tool_use.sh'));
      expect(cmds['Stop']).toBe(path.join(hooksDir, 'session_stop.sh'));
      expect(cmds['SubagentStop']).toBe(path.join(hooksDir, 'agent_end.sh'));
    }
  });
});

describe('wire name mapping', () => {
  const hooksDir = '/test/hooks';

  it.each(EXPECTED_WIRE_MAPPINGS)(
    '%s maps to correct wire format %s in the command string',
    (key, wireType) => {
      const cmds = buildHookCommands(hooksDir);
      expect(cmds).toHaveProperty(key);
      const cmdMap = new Map(Object.entries(cmds));
      expect(cmdMap.get(key)).toContain(`--type ${wireType}`);
    },
  );

  it('PascalCase keys follow snake_case wire format convention', () => {
    const cmds = buildHookCommands(hooksDir);
    for (const [key, wireType] of EXPECTED_WIRE_MAPPINGS) {
      const expectedWire = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      expect(wireType).toBe(expectedWire);
      const cmdMap = new Map(Object.entries(cmds));
      expect(cmdMap.get(key)).toContain(wireType);
    }
  });
});
