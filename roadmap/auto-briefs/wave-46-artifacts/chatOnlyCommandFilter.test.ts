import { describe, expect, it } from 'vitest';

import type { Command } from '../../CommandPalette/types';
import {
  __chatOnlyDisabledCommandIds,
  filterCommandsForChatShell,
} from './chatOnlyCommandFilter';

function makeCommand(id: string, label = id): Command {
  return { id, label, action: () => undefined };
}

describe('filterCommandsForChatShell', () => {
  it('removes IDE-only commands that are no-ops in the chat shell', () => {
    const inputs: Command[] = [
      makeCommand('view:toggle-sidebar'),
      makeCommand('view:toggle-agent-monitor'),
      makeCommand('view:split-editor'),
      makeCommand('git:time-travel'),
      makeCommand('git:review-all-changes'),
      makeCommand('git:review-unstaged-changes'),
      makeCommand('app:settings'),
      makeCommand('threads:search'),
    ];

    const result = filterCommandsForChatShell(inputs);

    expect(result.map((command) => command.id)).toEqual(['app:settings', 'threads:search']);
  });

  it('preserves chat-relevant commands, including terminal toggles and theme submenus', () => {
    const inputs: Command[] = [
      makeCommand('terminal'),
      makeCommand('terminal:toggle'),
      makeCommand('app:theme'),
      makeCommand('file:open-folder'),
      makeCommand('window:new'),
    ];

    const result = filterCommandsForChatShell(inputs);

    expect(result.map((command) => command.id)).toEqual(inputs.map((command) => command.id));
  });

  it('returns a new array and does not mutate the input', () => {
    const inputs: Command[] = [makeCommand('view:toggle-sidebar'), makeCommand('app:settings')];
    const before = inputs.slice();

    const result = filterCommandsForChatShell(inputs);

    expect(result).not.toBe(inputs);
    expect(inputs).toEqual(before);
  });

  it('exposes the disabled-id set for documentation/coverage purposes', () => {
    expect(__chatOnlyDisabledCommandIds.has('view:split-editor')).toBe(true);
    expect(__chatOnlyDisabledCommandIds.has('app:settings')).toBe(false);
  });
});
