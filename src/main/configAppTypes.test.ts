/**
 * configAppTypes.test.ts — Smoke tests for configAppTypes.ts.
 *
 * AppConfig is a pure TypeScript interface (no runtime logic). These tests
 * verify that objects conforming to a minimal AppConfig subset are well-typed
 * and that the module loads without errors.
 */

import { describe, expect, it } from 'vitest';

import type { AppConfig } from './configAppTypes';

// ── Structural smoke tests ───────────────────────────────────────────────────

describe('AppConfig — structural shape', () => {
  it('accepts a minimal AppConfig-shaped object', () => {
    const cfg: Partial<AppConfig> = {
      recentProjects: [],
      defaultProjectRoot: '/home/user/project',
      activeTheme: 'modern',
      hooksServerPort: 9999,
      terminalFontSize: 14,
      autoInstallHooks: true,
      shell: '',
      panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 200 },
      windowBounds: { width: 1280, height: 800, isMaximized: false },
      fontUI: '',
      fontMono: '',
      fontSizeUI: 13,
      keybindings: {},
      showBgGradient: true,
      customThemeColors: {},
      terminalSessions: [],
      customCSS: '',
      bookmarks: [],
      fileTreeIgnorePatterns: [],
      multiRoots: [],
      customPrompt: '',
      promptPreset: 'default',
      claudeCliSettings: {
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
      },
      codexCliSettings: {
        model: '',
        reasoningEffort: 'medium',
        sandbox: 'read-only',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      },
      agentChatSettings: {} as never,
      notifications: { level: 'all', alwaysNotify: false },
      agentTemplates: [],
      workspaceLayouts: [],
      activeLayoutName: '',
      extensionsEnabled: true,
      disabledExtensions: [],
      installedVsxExtensions: [],
      disabledVsxExtensions: [],
      lspEnabled: false,
      inlineCompletionsEnabled: false,
      embeddingsEnabled: false,
      embeddingProvider: 'local',
      voyageApiKey: '',
      lspServers: {},
      claudeAutoLaunch: false,
      approvalRequired: [],
      approvalTimeout: 0,
      workspaceSnapshots: [],
      terminalCursorStyle: 'block',
      commandBlocksEnabled: true,
      promptPattern: '',
      formatOnSave: false,
      contextLayer: {} as never,
      claudeMdSettings: {
        enabled: false,
        triggerMode: 'manual',
        model: 'sonnet',
        autoCommit: false,
        generateRoot: true,
        generateSubdirs: true,
        excludeDirs: [],
        leanMode: true,
        maxLines: 200,
      },
      modelProviders: [],
      modelSlots: { terminal: '', agentChat: '', claudeMdGeneration: '', inlineCompletion: '' },
      webAccessPort: 7890,
      webAccessToken: '',
      webAccessPassword: '',
      glassOpacity: 0.85,
      materialVariant: 'vapor',
      routerSettings: {
        enabled: true,
        layer1Enabled: true,
        layer2Enabled: true,
        layer3Enabled: true,
        layer2ConfidenceThreshold: 0.6,
        paranoidMode: false,
      },
      routerLastRetrainCount: 0,
      internalMcpEnabled: true,
      usePtyHost: false,
      useExtensionHost: false,
      useMcpHost: false,
      backgroundJobsMaxConcurrent: 2,
      persistTerminalSessions: false,
      trustedWorkspaces: [],
      autoCheckpoint: true,
      authOnboardingDismissed: false,
      codebaseGraph: { gcEnabled: true, gcDaysThreshold: 90 },
    };

    expect(cfg.defaultProjectRoot).toBe('/home/user/project');
    expect(cfg.activeTheme).toBe('modern');
    expect(cfg.panelSizes?.leftSidebar).toBe(240);
    expect(cfg.routerSettings?.enabled).toBe(true);
    expect(cfg.codebaseGraph?.gcDaysThreshold).toBe(90);
  });

  it('accepts optional wave-gated fields', () => {
    const cfg: Partial<AppConfig> = {
      layout: { presets: { v2: true }, dragAndDrop: true },
      provenanceTracking: true,
      researchSettings: { globalEnabled: false, defaultMode: 'conservative' },
      ecosystem: { systemPrompt: '', rulesAndSkillsInstallEnabled: false },
      platform: { language: 'en', updateChannel: 'stable' },
      theming: { accentOverride: '#ff0000' },
      mobileAccess: { enabled: false, pairedDevices: [] },
    };
    expect(cfg.layout?.dragAndDrop).toBe(true);
    expect(cfg.researchSettings?.defaultMode).toBe('conservative');
    expect(cfg.theming?.accentOverride).toBe('#ff0000');
  });

  it('activeTheme accepts all valid theme values', () => {
    const themes: AppConfig['activeTheme'][] = [
      'retro',
      'modern',
      'warp',
      'cursor',
      'kiro',
      'glass',
      'light',
      'high-contrast',
      'custom',
    ];
    expect(themes).toHaveLength(9);
    expect(themes).toContain('glass');
  });

  it('terminalCursorStyle accepts block, underline, bar', () => {
    const styles: AppConfig['terminalCursorStyle'][] = ['block', 'underline', 'bar'];
    expect(styles).toHaveLength(3);
  });

  it('materialVariant accepts vapor, prism, warp', () => {
    const variants: AppConfig['materialVariant'][] = ['vapor', 'prism', 'warp'];
    expect(variants).toHaveLength(3);
  });
});
