import type Store from 'electron-store';

import { migrateChatPrimary } from './configMigrations';
import { ensureStore, lazyStore } from './configStoreLazy';

export type {
  AgentTemplate,
  AppConfig,
  AppEcosystemConfig,
  AppLayoutConfig,
  ClaudeCliSettings,
  ClaudeMdSettings,
  CodebaseGraphSettings,
  CodexCliSettings,
  ContextScoringSettings,
  InstalledVsxExtension,
  MobileAccessConfig,
  ModelProvider,
  ModelSlotAssignments,
  NotificationSettings,
  PageRankSeedWeights,
  PairedDeviceRecord,
  PanelSizes,
  PlatformConfig,
  ProviderModel,
  ResearchSettings,
  RouterSettings,
  SessionDispatchConfig,
  TerminalSessionSnapshot,
  ThemingConfig,
  WindowBounds,
  WindowSession,
  WorkspaceLayout,
  WorkspaceSnapshot,
} from './configTypes';

import type { AppConfig } from './configTypes';

export const store: Store<AppConfig> = lazyStore;

// In-memory cache to avoid re-reading config.json from disk on every call.
// electron-store's underlying conf library reads the file on every .get().
// This cache is invalidated on every write via setConfigValue.
let configCache: AppConfig | null = null;
// Wave 43 Phase A — run migration exactly once per process lifetime.
let chatPrimaryMigrationDone = false;

export function getConfig(): AppConfig {
  if (!configCache) {
    if (!chatPrimaryMigrationDone) {
      chatPrimaryMigrationDone = true;
      migrateChatPrimary(); // sets configCache = null via store write if migration fires
    }
    configCache = ensureStore().store;
  }
  return configCache;
}

export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  // eslint-disable-next-line security/detect-object-injection -- key is constrained to keyof AppConfig by TypeScript
  return getConfig()[key];
}

export function setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  ensureStore().set(key, value);
  configCache = null; // invalidate cache on write
}
