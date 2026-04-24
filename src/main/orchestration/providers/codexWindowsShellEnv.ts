const STABLE_WINDOWS_SHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function isWindowsAppsPowerShellAlias(value: string | undefined): boolean {
  return /\\AppData\\Local\\Microsoft\\WindowsApps\\(?:pwsh|powershell)\.exe$/i.test(value ?? '');
}

export function withStableWindowsShellEnv(
  env: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  if (platform !== 'win32') return env;

  const next = { ...env };
  const shell = next.SHELL ?? next.Shell ?? next.shell;
  if (!shell || isWindowsAppsPowerShellAlias(shell)) {
    next.SHELL = STABLE_WINDOWS_SHELL;
    if (next.Shell) next.Shell = STABLE_WINDOWS_SHELL;
    if (next.shell) next.shell = STABLE_WINDOWS_SHELL;
  }
  return next;
}
