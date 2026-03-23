import { buildCodexCliArgs } from './codex'
import type { CodexCliSettings } from './config'

function escapePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`
}

export function buildCodexArgs(settings: CodexCliSettings): string[] {
  return buildCodexCliArgs(settings)
}

export function buildCodexCommand(settings: CodexCliSettings): string {
  return ['codex', ...buildCodexArgs(settings).map(escapeCliArg)].join(' ')
}

function escapeCliArg(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

export function buildCodexLaunchArgs(
  baseArgs: string[],
  resumeThreadId?: string,
): { shell: string; args: string[] } {
  const codexArgs = [...baseArgs]
  if (resumeThreadId) {
    codexArgs.unshift('resume', resumeThreadId)
  }

  if (process.platform === 'win32') {
    const escaped = ['codex', ...codexArgs].map(escapePowerShellArg).join(' ')
    return {
      shell: 'powershell.exe',
      args: ['-NoLogo', '-NoExit', '-Command', `& ${escaped}`],
    }
  }

  return { shell: 'codex', args: codexArgs }
}
