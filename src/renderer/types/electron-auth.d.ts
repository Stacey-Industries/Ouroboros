import type {
  AuthProvider,
  AuthState,
  AuthUser,
  CliCredentialDetection,
  GitHubDeviceFlowInfo,
  GitHubLoginEvent,
} from '@shared/types/auth';

export type { AuthProvider, AuthState, AuthUser, CliCredentialDetection };
export type { GitHubDeviceFlowInfo, GitHubLoginEvent };

export interface AuthAPI {
  getStates: () => Promise<{
    success: boolean;
    states?: AuthState[];
    storageSecure?: boolean;
    error?: string;
  }>;
  startLogin: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  cancelLogin: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  logout: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  setApiKey: (
    provider: AuthProvider,
    apiKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  importCliCreds: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  detectCliCreds: () => Promise<{
    success: boolean;
    detections?: CliCredentialDetection[];
    error?: string;
  }>;
  openExternal: (url: string) => Promise<void>;
  onLoginEvent: (callback: (event: GitHubLoginEvent) => void) => () => void;
  onStateChanged: (callback: (states: AuthState[]) => void) => () => void;
}
