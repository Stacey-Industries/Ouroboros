/**
 * @vitest-environment jsdom
 *
 * TitleBar.menus.ts — unit tests covering getMenuDefinitions and
 * getWorkbenchMenuDefinitions (Wave 59 Phase C additions).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMenuDefinitions, getWorkbenchMenuDefinitions } from './TitleBar.menus';

// ── Shared test helpers ───────────────────────────────────────────────────────

function collectLabels(menus: ReturnType<typeof getMenuDefinitions>): string[] {
  return menus.map((m) => m.label);
}

function findItem(
  menus: ReturnType<typeof getMenuDefinitions>,
  menuLabel: string,
  itemLabel: string,
) {
  const menu = menus.find((m) => m.label === menuLabel);
  return menu?.items.find((i) => i.label === itemLabel);
}

// ── getMenuDefinitions ────────────────────────────────────────────────────────

describe('getMenuDefinitions', () => {
  it('returns six menus: File, Edit, View, Go, Terminal, Help', () => {
    const labels = collectLabels(getMenuDefinitions());
    expect(labels).toEqual(['File', 'Edit', 'View', 'Go', 'Terminal', 'Help']);
  });

  it('View menu contains "Switch to Chat Mode" when not in immersive chat', () => {
    const item = findItem(getMenuDefinitions(false), 'View', 'Switch to Chat Mode');
    expect(item).toBeDefined();
  });

  it('View menu contains "Exit Chat Mode" when in immersive chat', () => {
    const item = findItem(getMenuDefinitions(true), 'View', 'Exit Chat Mode');
    expect(item).toBeDefined();
  });

  it('Terminal menu is present', () => {
    const labels = collectLabels(getMenuDefinitions());
    expect(labels).toContain('Terminal');
  });
});

// ── getWorkbenchMenuDefinitions ───────────────────────────────────────────────

describe('getWorkbenchMenuDefinitions', () => {
  it('returns five menus: File, Edit, View, Tools, Help', () => {
    const labels = collectLabels(getWorkbenchMenuDefinitions());
    expect(labels).toEqual(['File', 'Edit', 'View', 'Tools', 'Help']);
  });

  it('does NOT include a Terminal menu', () => {
    const labels = collectLabels(getWorkbenchMenuDefinitions());
    expect(labels).not.toContain('Terminal');
  });

  describe('File menu', () => {
    it('contains New Session', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'File', 'New Session')).toBeDefined();
    });

    it('contains New Chat in Active Session', () => {
      expect(
        findItem(getWorkbenchMenuDefinitions(), 'File', 'New Chat in Active Session'),
      ).toBeDefined();
    });

    it('contains Open Project', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'File', 'Open Project')).toBeDefined();
    });

    it('contains Exit Chat Mode', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'File', 'Exit Chat Mode')).toBeDefined();
    });
  });

  describe('Edit menu', () => {
    it('contains Cut, Copy, Paste', () => {
      const menus = getWorkbenchMenuDefinitions();
      expect(findItem(menus, 'Edit', 'Cut')).toBeDefined();
      expect(findItem(menus, 'Edit', 'Copy')).toBeDefined();
      expect(findItem(menus, 'Edit', 'Paste')).toBeDefined();
    });

    it('contains Find in Chat', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Edit', 'Find in Chat')).toBeDefined();
    });

    it('contains Find Next and Find Previous', () => {
      const menus = getWorkbenchMenuDefinitions();
      expect(findItem(menus, 'Edit', 'Find Next')).toBeDefined();
      expect(findItem(menus, 'Edit', 'Find Previous')).toBeDefined();
    });
  });

  describe('View menu', () => {
    it('contains Toggle Outer Rail', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Outer Rail')).toBeDefined();
    });

    it('contains Toggle Inner Sidebar', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Inner Sidebar')).toBeDefined();
    });

    it('contains Toggle Utility Drawer', () => {
      expect(
        findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Utility Drawer'),
      ).toBeDefined();
    });

    it('contains Toggle Terminal Dock', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Terminal Dock')).toBeDefined();
    });

    it('contains Toggle Artifact Pane', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Artifact Pane')).toBeDefined();
    });

    it('contains Switch to IDE Shell', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'View', 'Switch to IDE Shell')).toBeDefined();
    });
  });

  describe('Tools menu', () => {
    it('contains Settings', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Tools', 'Settings')).toBeDefined();
    });

    it('contains Keyboard Shortcuts', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Tools', 'Keyboard Shortcuts')).toBeDefined();
    });
  });

  describe('Help menu', () => {
    it('contains About Ouroboros', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Help', 'About Ouroboros')).toBeDefined();
    });

    it('contains Documentation', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Help', 'Documentation')).toBeDefined();
    });

    it('contains Report Issue', () => {
      expect(findItem(getWorkbenchMenuDefinitions(), 'Help', 'Report Issue')).toBeDefined();
    });
  });

  describe('action dispatchers', () => {
    let dispatched: string[];

    beforeEach(() => {
      dispatched = [];
      vi.spyOn(window, 'dispatchEvent').mockImplementation((evt: Event) => {
        dispatched.push(evt.type);
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('Find in Chat dispatches agent-ide:open-chat-search', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'Edit', 'Find in Chat');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:open-chat-search');
    });

    it('Toggle Outer Rail dispatches agent-ide:workbench-toggle-outer-rail', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Outer Rail');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:workbench-toggle-outer-rail');
    });

    it('Toggle Inner Sidebar dispatches agent-ide:workbench-toggle-inner-sidebar', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Inner Sidebar');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:workbench-toggle-inner-sidebar');
    });

    it('Toggle Terminal Dock dispatches agent-ide:workbench-toggle-terminal-dock', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Terminal Dock');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:workbench-toggle-terminal-dock');
    });

    it('Toggle Artifact Pane dispatches agent-ide:workbench-toggle-artifact-pane', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'View', 'Toggle Artifact Pane');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:workbench-toggle-artifact-pane');
    });

    it('New Session dispatches agent-ide:workbench-new-session', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'File', 'New Session');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:workbench-new-session');
    });

    it('Exit Chat Mode dispatches agent-ide:toggle-immersive-chat', () => {
      const item = findItem(getWorkbenchMenuDefinitions(), 'File', 'Exit Chat Mode');
      item?.action?.();
      expect(dispatched).toContain('agent-ide:toggle-immersive-chat');
    });
  });
});
