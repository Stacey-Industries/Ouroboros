import { describe, expect, it } from 'vitest';

import { withStableWindowsShellEnv } from './codexWindowsShellEnv';

describe('withStableWindowsShellEnv', () => {
  it('replaces the WindowsApps pwsh alias with a stable PowerShell executable on Windows', () => {
    const env = withStableWindowsShellEnv(
      {
        PATH: 'C:\\Windows\\System32',
        SHELL: 'C:\\Users\\coles\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe',
      },
      'win32',
    );

    expect(env.SHELL).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(env.PATH).toBe('C:\\Windows\\System32');
  });

  it('sets a stable shell on Windows when SHELL is absent', () => {
    expect(withStableWindowsShellEnv({}, 'win32').SHELL).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
  });

  it('preserves explicit non-WindowsApps shells on Windows', () => {
    const shell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

    expect(withStableWindowsShellEnv({ SHELL: shell }, 'win32').SHELL).toBe(shell);
  });

  it('does not change the shell on non-Windows platforms', () => {
    expect(withStableWindowsShellEnv({ SHELL: '/bin/zsh' }, 'linux')).toEqual({
      SHELL: '/bin/zsh',
    });
  });
});
