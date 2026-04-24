import { describe, expect, it, vi } from 'vitest';

import { buildPanelToggleHandlers, resolveProvider } from './AppLayout.panelEvents';

describe('buildPanelToggleHandlers', () => {
  it('calls toggle with leftSidebar for onToggleSidebar', () => {
    const toggle = vi.fn();
    const handlers = buildPanelToggleHandlers(toggle);
    handlers.onToggleSidebar();
    expect(toggle).toHaveBeenCalledWith('leftSidebar');
  });

  it('calls toggle with rightSidebar for onToggleAgentArea', () => {
    const toggle = vi.fn();
    const handlers = buildPanelToggleHandlers(toggle);
    handlers.onToggleAgentArea();
    expect(toggle).toHaveBeenCalledWith('rightSidebar');
  });

  it('calls toggle with terminal for onToggleTerminal', () => {
    const toggle = vi.fn();
    const handlers = buildPanelToggleHandlers(toggle);
    handlers.onToggleTerminal();
    expect(toggle).toHaveBeenCalledWith('terminal');
  });

  it('calls toggle with editor for onToggleEditor', () => {
    const toggle = vi.fn();
    const handlers = buildPanelToggleHandlers(toggle);
    handlers.onToggleEditor();
    expect(toggle).toHaveBeenCalledWith('editor');
  });
});

describe('resolveProvider', () => {
  it('uses explicit provider field when present', () => {
    expect(resolveProvider({ provider: 'codex' })).toBe('codex');
    expect(resolveProvider({ provider: 'claude-code' })).toBe('claude-code');
  });

  it('infers codex when codexThreadId is present and no provider field', () => {
    expect(resolveProvider({ codexThreadId: 'thread-123' })).toBe('codex');
  });

  it('defaults to claude-code when no provider or codexThreadId', () => {
    expect(resolveProvider({})).toBe('claude-code');
  });
});
