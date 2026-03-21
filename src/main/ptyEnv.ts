import os from 'os'

import type { ModelSlotAssignments } from './config'
import { getConfigValue } from './config'
import { resolveModelEnv } from './providers'
import { buildShellIntegrationEnv, detectShellType } from './shellIntegration/resolve'

export interface ResolvedSpawnOptions {
  cwd: string
  cols: number
  rows: number
}

export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

export function getDefaultArgs(shell: string): string[] {
  if (process.platform === 'win32') {
    const base = shell.toLowerCase()
    return base.includes('powershell') || base.includes('pwsh') ? ['-NoLogo'] : []
  }
  return ['-l', '-i']
}

export function resolveSpawnOptions(options: {
  cwd?: string
  cols?: number
  rows?: number
}): ResolvedSpawnOptions {
  return {
    cwd: options.cwd ?? os.homedir(),
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
  }
}

export function buildBaseEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>
}

function buildHistoryEnv(shell: string): Record<string, string> {
  const shellLower = shell.toLowerCase()
  const isZsh = shellLower.includes('zsh')
  const isFish = shellLower.includes('fish')
  const isPowerShell = shellLower.includes('pwsh') || shellLower.includes('powershell')
  if (isPowerShell || isFish) {
    return {}
  }

  const historyEnv: Record<string, string> = {
    HISTSIZE: '10000',
    HISTFILESIZE: '10000',
    HISTCONTROL: 'ignoredups:erasedups',
  }

  if (isZsh) {
    historyEnv.HISTFILE = `${os.homedir()}/.zsh_history`
    historyEnv.SAVEHIST = '10000'
    return historyEnv
  }

  historyEnv.HISTFILE = `${os.homedir()}/.bash_history`
  return historyEnv
}

function buildPromptEnv(): Record<string, string> {
  if (process.platform === 'win32') {
    return {}
  }

  const configPrompt = getConfigValue('customPrompt') as string
  const preset = (getConfigValue('promptPreset') as string) || 'default'
  const presets: Record<string, string> = {
    default: '',
    minimal: '$ ',
    git: '\\[\\e[32m\\]\\u\\[\\e[0m\\]@\\[\\e[34m\\]\\h\\[\\e[0m\\] \\[\\e[33m\\]\\w\\[\\e[0m\\]\\$(git branch 2>/dev/null | grep "\\* " | sed "s/* /:/") $ ',
    powerline: '\\[\\e[44;37m\\] \\u \\[\\e[0m\\]\\[\\e[34m\\]\\[\\e[0m\\] \\[\\e[42;30m\\] \\w \\[\\e[0m\\]\\[\\e[32m\\]\\[\\e[0m\\] ',
    custom: configPrompt,
  }

  const prompt = preset === 'custom' ? configPrompt : presets[preset] ?? ''
  return prompt ? { PS1: prompt, PROMPT: prompt } : {}
}

export function buildShellEnv(shell: string, extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...buildBaseEnv(extraEnv),
    ...buildHistoryEnv(shell),
    ...buildPromptEnv(),
  }
}

/**
 * Build shell environment with shell integration scripts injected.
 * Returns env vars and optional replacement args for the shell command.
 * If shellArgs is null, use getDefaultArgs() as normal.
 * If shellArgs is non-null, use those args instead of the defaults.
 */
export function buildShellEnvWithIntegration(
  shell: string,
  extraEnv?: Record<string, string>,
): { env: Record<string, string>; shellArgs: string[] | null } {
  const baseEnv = buildShellEnv(shell, extraEnv)
  return buildShellIntegrationEnv(shell, baseEnv)
}

export function buildProviderEnv(slotKey: keyof ModelSlotAssignments): Record<string, string> {
  const slots = getConfigValue('modelSlots') as ModelSlotAssignments | undefined
  const slotValue = slots?.[slotKey] ?? ''
  return resolveModelEnv(slotValue)
}

export { detectShellType } from './shellIntegration/resolve'
