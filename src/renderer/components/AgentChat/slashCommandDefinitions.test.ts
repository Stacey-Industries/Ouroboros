/**
 * @vitest-environment jsdom
 *
 * Smoke tests for slashCommandDefinitions — verifies the builder produces the
 * expected command set with and without optional context entries.
 */
import { describe, expect, it } from 'vitest';

import { buildChatSlashCommands } from './slashCommandDefinitions';

describe('buildChatSlashCommands', () => {
  it('includes static commands by default', () => {
    const commands = buildChatSlashCommands({});
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('settings');
    expect(ids).toContain('terminal');
    expect(ids).toContain('clear');
    expect(ids).toContain('compact');
    expect(ids).toContain('new');
  });

  it('includes research commands when researchEnabled is not false', () => {
    const commands = buildChatSlashCommands({});
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('research');
    expect(ids).toContain('spec-with-research');
    expect(ids).toContain('implement-with-research');
  });

  it('excludes research commands when researchEnabled is false', () => {
    const commands = buildChatSlashCommands({ researchEnabled: false });
    const ids = commands.map((c) => c.id);
    expect(ids).not.toContain('research');
    expect(ids).not.toContain('spec-with-research');
  });

  it('clear command invokes onClearChat', () => {
    let called = false;
    const commands = buildChatSlashCommands({ onClearChat: () => (called = true) });
    const clear = commands.find((c) => c.id === 'clear');
    expect(clear).toBeDefined();
    clear!.action();
    expect(called).toBe(true);
  });

  it('memories command has clearDraft true', () => {
    const commands = buildChatSlashCommands({});
    const memories = commands.find((c) => c.id === 'memories');
    expect(memories?.clearDraft).toBe(true);
  });

  it('appends user-defined commands at the end', () => {
    const commands = buildChatSlashCommands({
      commands: [{ id: 'custom', name: 'Custom', description: 'd', scope: 'user' } as never],
    });
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('user:custom');
  });
});
