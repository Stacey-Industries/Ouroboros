/**
 * shellIntegration/resolve.ts — Resolves paths to shell integration scripts
 * and determines which shell type is being used.
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type ShellType = 'bash' | 'zsh' | 'pwsh' | 'unknown'

/**
 * Detect shell type from a shell executable path.
 */
export function detectShellType(shell: string): ShellType {
  const base = path.basename(shell).toLowerCase().replace(/\.exe$/, '')
  if (base === 'bash' || base === 'sh') return 'bash'
  if (base === 'zsh') return 'zsh'
  if (base === 'pwsh' || base === 'powershell') return 'pwsh'
  return 'unknown'
}

/**
 * Get the directory containing shell integration scripts.
 * Checks multiple candidate paths (packaged app vs dev).
 */
function getShellIntegrationDir(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'shellIntegration'),
    path.join(app.getAppPath(), 'src', 'main', 'shellIntegration'),
    path.join(__dirname, 'shellIntegration'),
    path.join(__dirname, '..', '..', 'src', 'main', 'shellIntegration'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Fallback to the source directory (dev mode)
  return candidates[1]
}

const SCRIPT_MAP: Record<Exclude<ShellType, 'unknown'>, string> = {
  bash: 'bash.sh',
  zsh: 'zsh.sh',
  pwsh: 'pwsh.ps1',
}

/**
 * Get the path to the shell integration script for a given shell type.
 * Returns null if the shell type is unknown or the script doesn't exist.
 */
export function getShellIntegrationScript(shellType: ShellType): string | null {
  if (shellType === 'unknown') return null
  const dir = getShellIntegrationDir()
  const scriptPath = path.join(dir, SCRIPT_MAP[shellType])
  return fs.existsSync(scriptPath) ? scriptPath : null
}

/**
 * Build additional environment variables to inject shell integration
 * for the detected shell type. For bash and zsh, integration is
 * injected purely via environment variables. For PowerShell, a
 * startup command is returned that should replace the default args.
 */
export function buildShellIntegrationEnv(
  shell: string,
  existingEnv: Record<string, string>,
): { env: Record<string, string>; shellArgs: string[] | null } {
  const shellType = detectShellType(shell)
  const scriptPath = getShellIntegrationScript(shellType)

  if (!scriptPath) {
    return { env: existingEnv, shellArgs: null }
  }

  const env = { ...existingEnv }

  switch (shellType) {
    case 'bash':
      // BASH_ENV is sourced by bash for non-interactive shells.
      // For interactive login shells (bash -l -i), .bashrc/.bash_profile
      // are sourced but BASH_ENV is also checked. This is the standard
      // mechanism VS Code uses for shell integration injection.
      env.BASH_ENV = scriptPath
      return { env, shellArgs: null }

    case 'zsh':
      // For zsh, we set ZDOTDIR to a custom value would be invasive.
      // Instead, set an env var so the user can opt in by adding
      // `source $OUROBOROS_ZSH_INTEGRATION` to their .zshrc, or we
      // use the ENV variable (honored by sh-compatible mode) and also
      // set BASH_ENV as a fallback for zsh in sh-compat mode.
      // The most reliable non-invasive approach: set the env var and
      // also try BASH_ENV (zsh ignores it, but it's harmless).
      env.OUROBOROS_ZSH_INTEGRATION = scriptPath
      env.BASH_ENV = scriptPath
      return { env, shellArgs: null }

    case 'pwsh':
      // For PowerShell, dot-source the integration script on startup.
      // This replaces the default args (-NoLogo) with a command that
      // loads the integration then enters interactive mode.
      env.OUROBOROS_PWSH_INTEGRATION = scriptPath
      return {
        env,
        shellArgs: [
          '-NoLogo',
          '-NoExit',
          '-Command',
          `. '${scriptPath.replace(/'/g, "''")}'`,
        ],
      }
  }
}
