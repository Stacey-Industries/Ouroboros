export interface PlatformConfig {
  onboarding?: { completed?: boolean };
  language?: 'en' | 'es';
  updateChannel?: 'stable' | 'beta';
  crashReports?: { enabled?: boolean; webhookUrl?: string };
  lastSeenVersion?: string;
  dismissedEmptyStates?: Record<string, boolean>;
}

export interface ContextLayerConfig {
  enabled: boolean;
  maxModules: number;
  maxSizeBytes: number;
  debounceMs: number;
  autoSummarize: boolean;
  moduleDepthLimit: number;
}
