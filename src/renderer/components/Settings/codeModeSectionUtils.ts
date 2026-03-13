import type { CodeModeStatusResult } from '../../types/electron';

export function getCodeModeApi() {
  return 'electronAPI' in window ? window.electronAPI.codemode : null;
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function parseServerNames(serverNames: string): string[] {
  return serverNames.split(',').map((value) => value.trim()).filter(Boolean);
}

export function readStatus(result: CodeModeStatusResult | null): {
  generatedTypes: string;
  isEnabled: boolean;
  proxiedServers: string[];
} {
  return {
    generatedTypes: result?.generatedTypes ?? '',
    isEnabled: result?.enabled ?? false,
    proxiedServers: result?.proxiedServers ?? [],
  };
}
