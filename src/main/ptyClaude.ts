import type { ClaudeCliSettings } from './config'

function pushStringFlag(args: string[], value: string, flag: string, defaultValue = ''): void {
  if (value && value !== defaultValue) {
    args.push(flag, value)
  }
}

function pushBooleanFlag(args: string[], value: boolean, flag: string): void {
  if (value) {
    args.push(flag)
  }
}

export function buildClaudeArgs(settings: ClaudeCliSettings): string[] {
  const args: string[] = []
  pushStringFlag(args, settings.permissionMode, '--permission-mode', 'default')
  pushStringFlag(args, settings.model, '--model')
  pushStringFlag(args, settings.effort, '--effort')
  pushBooleanFlag(args, settings.verbose, '--verbose')
  if (settings.maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(settings.maxBudgetUsd))
  }
  pushStringFlag(args, settings.allowedTools, '--allowedTools')
  pushStringFlag(args, settings.disallowedTools, '--disallowedTools')
  pushStringFlag(args, settings.appendSystemPrompt, '--append-system-prompt')
  for (const dir of settings.addDirs ?? []) {
    args.push('--add-dir', dir)
  }
  pushBooleanFlag(args, settings.chrome, '--chrome')
  pushBooleanFlag(args, settings.worktree, '--worktree')
  pushBooleanFlag(args, settings.dangerouslySkipPermissions, '--dangerously-skip-permissions')
  return args
}

function quoteCommandArg(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

export function buildClaudeCommand(settings: ClaudeCliSettings): string {
  return ['claude', ...buildClaudeArgs(settings).map(quoteCommandArg)].join(' ')
}
