/**
 * configTypes.test.ts — Smoke tests for configTypes.ts type exports.
 *
 * Since this file contains only interface/type definitions (no runtime logic),
 * tests verify that the exports exist and that objects conforming to the
 * interfaces satisfy TypeScript structural typing at runtime.
 */

import { describe, expect, it } from 'vitest';

// Import types as values-via-satisfies patterns are not available in plain JS,
// so we import the module and assert on its structure at the type level.
// The actual test is that this file compiles — runtime checks confirm shapes.
import type {
  AgentTemplate,
  ClaudeCliSettings,
  ClaudeMdSettings,
  CodebaseGraphSettings,
  CodexCliSettings,
  ContextScoringSettings,
  MobileAccessConfig,
  ModelProvider,
  ModelSlotAssignments,
  NotificationSettings,
  PageRankSeedWeights,
  PairedDeviceRecord,
  PanelSizes,
  RouterSettings,
  SessionDispatchConfig,
  TerminalSessionSnapshot,
  ThemingConfig,
  WindowBounds,
  WindowSession,
  WorkspaceLayout,
  WorkspaceSnapshot,
} from './configTypes';

// ── Shape smoke tests ────────────────────────────────────────────────────────

describe('configTypes — PanelSizes', () => {
  it('accepts valid PanelSizes object', () => {
    const ps: PanelSizes = { leftSidebar: 240, rightSidebar: 300, terminal: 200 };
    expect(ps.leftSidebar).toBe(240);
  });
});

describe('configTypes — WindowBounds', () => {
  it('accepts valid WindowBounds', () => {
    const wb: WindowBounds = { width: 1280, height: 800, isMaximized: false };
    expect(wb.width).toBe(1280);
  });
});

describe('configTypes — WindowSession', () => {
  it('accepts WindowSession with projectRoots', () => {
    const ws: WindowSession = { projectRoots: ['/home/user/project'] };
    expect(ws.projectRoots).toHaveLength(1);
  });
});

describe('configTypes — TerminalSessionSnapshot', () => {
  it('accepts minimal snapshot', () => {
    const snap: TerminalSessionSnapshot = { cwd: '/home/user', title: 'bash' };
    expect(snap.cwd).toBe('/home/user');
  });
});

describe('configTypes — ClaudeCliSettings', () => {
  it('has expected required fields', () => {
    const s: ClaudeCliSettings = {
      permissionMode: 'default',
      model: '',
      effort: 'medium',
      appendSystemPrompt: '',
      verbose: false,
      maxBudgetUsd: 0,
      allowedTools: '',
      disallowedTools: '',
      addDirs: [],
      chrome: false,
      worktree: false,
      dangerouslySkipPermissions: false,
      useWarmProcess: true,
    };
    expect(s.permissionMode).toBe('default');
  });
});

describe('configTypes — CodexCliSettings', () => {
  it('accepts valid CodexCliSettings', () => {
    const s: CodexCliSettings = {
      model: '',
      reasoningEffort: 'medium',
      sandbox: 'read-only',
      approvalPolicy: 'on-request',
      profile: '',
      addDirs: [],
      search: false,
      skipGitRepoCheck: false,
      dangerouslyBypassApprovalsAndSandbox: false,
    };
    expect(s.sandbox).toBe('read-only');
  });
});

describe('configTypes — NotificationSettings', () => {
  it('accepts valid notification settings', () => {
    const n: NotificationSettings = { level: 'all', alwaysNotify: false };
    expect(n.level).toBe('all');
  });
});

describe('configTypes — ModelProvider', () => {
  it('accepts valid ModelProvider', () => {
    const p: ModelProvider = {
      id: 'anthropic',
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-test',
      models: [],
      enabled: true,
    };
    expect(p.id).toBe('anthropic');
  });
});

describe('configTypes — ModelSlotAssignments', () => {
  it('has four slot fields', () => {
    const m: ModelSlotAssignments = {
      terminal: '',
      agentChat: '',
      claudeMdGeneration: '',
      inlineCompletion: '',
    };
    expect(Object.keys(m)).toHaveLength(4);
  });
});

describe('configTypes — RouterSettings', () => {
  it('accepts valid RouterSettings', () => {
    const r: RouterSettings = {
      enabled: true,
      layer1Enabled: true,
      layer2Enabled: true,
      layer3Enabled: true,
      layer2ConfidenceThreshold: 0.6,
      paranoidMode: false,
    };
    expect(r.enabled).toBe(true);
  });
});

describe('configTypes — AgentTemplate', () => {
  it('accepts minimal AgentTemplate', () => {
    const t: AgentTemplate = { id: 'tmpl-1', name: 'Debug', promptTemplate: 'Fix: {{openFile}}' };
    expect(t.id).toBe('tmpl-1');
  });
});

describe('configTypes — WorkspaceSnapshot', () => {
  it('accepts valid WorkspaceSnapshot', () => {
    const ws: WorkspaceSnapshot = {
      id: 'snap-1',
      commitHash: 'abc123',
      sessionId: 'sess-1',
      timestamp: 1000,
      type: 'manual',
    };
    expect(ws.type).toBe('manual');
  });
});

describe('configTypes — CodebaseGraphSettings', () => {
  it('accepts valid settings', () => {
    const s: CodebaseGraphSettings = { gcEnabled: true, gcDaysThreshold: 90 };
    expect(s.gcDaysThreshold).toBe(90);
  });
});

describe('configTypes — PageRankSeedWeights', () => {
  it('accepts valid weights', () => {
    const w: PageRankSeedWeights = { pinned: 0.5, symbol: 0.3, user_edit: 0.2 };
    expect(w.pinned + w.symbol + w.user_edit).toBeCloseTo(1.0);
  });
});

describe('configTypes — ContextScoringSettings', () => {
  it('accepts valid settings', () => {
    const s: ContextScoringSettings = {
      provenanceWeights: true,
      pagerank: true,
      pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
    };
    expect(s.provenanceWeights).toBe(true);
  });
});

describe('configTypes — PairedDeviceRecord', () => {
  it('accepts valid record', () => {
    const d: PairedDeviceRecord = {
      id: 'dev-1',
      label: 'My Phone',
      refreshTokenHash: 'hash',
      fingerprint: 'fp',
      capabilities: ['chat'],
      issuedAt: '2024-01-01',
      lastSeenAt: '2024-01-02',
    };
    expect(d.id).toBe('dev-1');
  });
});

describe('configTypes — MobileAccessConfig', () => {
  it('accepts valid config', () => {
    const m: MobileAccessConfig = { enabled: false, pairedDevices: [] };
    expect(m.pairedDevices).toHaveLength(0);
  });
});

describe('configTypes — SessionDispatchConfig', () => {
  it('accepts valid config', () => {
    const s: SessionDispatchConfig = {
      enabled: false,
      maxConcurrent: 1,
      jobTimeoutMs: 1_800_000,
      queue: [],
    };
    expect(s.maxConcurrent).toBe(1);
  });
});

describe('configTypes — ThemingConfig', () => {
  it('accepts empty theming config', () => {
    const t: ThemingConfig = {};
    expect(t).toBeDefined();
  });
});

describe('configTypes — ClaudeMdSettings', () => {
  it('accepts valid settings', () => {
    const s: ClaudeMdSettings = {
      enabled: false,
      triggerMode: 'manual',
      model: 'sonnet',
      autoCommit: false,
      generateRoot: true,
      generateSubdirs: true,
      excludeDirs: [],
      leanMode: true,
      maxLines: 200,
    };
    expect(s.model).toBe('sonnet');
  });
});

describe('configTypes — WorkspaceLayout', () => {
  it('accepts valid layout', () => {
    const l: WorkspaceLayout = {
      name: 'Default',
      panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 200 },
      visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
    };
    expect(l.name).toBe('Default');
  });
});
