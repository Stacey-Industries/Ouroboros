import type { ClaudeCliSettings } from '../config'
import type { AgentChatContextBehavior, AgentChatDefaultView, AgentChatSettings } from './types'
import type { OrchestrationProvider, VerificationProfileName } from '../orchestration/types'

export const AGENT_CHAT_PROVIDERS = ['anthropic-api', 'claude-code', 'codex'] as const satisfies readonly OrchestrationProvider[]
export const AGENT_CHAT_VERIFICATION_PROFILES = ['fast', 'default', 'full'] as const satisfies readonly VerificationProfileName[]
export const AGENT_CHAT_CONTEXT_BEHAVIORS = ['auto', 'manual'] as const satisfies readonly AgentChatContextBehavior[]
export const AGENT_CHAT_DEFAULT_VIEWS = ['chat', 'monitor'] as const satisfies readonly AgentChatDefaultView[]

export const AGENT_CHAT_SETTINGS_DEFAULTS: AgentChatSettings = {
  defaultProvider: 'anthropic-api',
  defaultVerificationProfile: 'default',
  contextBehavior: 'auto',
  showAdvancedControls: false,
  openDetailsOnFailure: false,
  defaultView: 'chat',
}

export const CLAUDE_CLI_SETTINGS_FALLBACK: ClaudeCliSettings = {
  permissionMode: 'default',
  model: '',
  effort: '',
  appendSystemPrompt: '',
  verbose: false,
  maxBudgetUsd: 0,
  allowedTools: '',
  disallowedTools: '',
  addDirs: [],
  chrome: false,
  worktree: false,
  dangerouslySkipPermissions: false,
}

export interface AgentChatSettingsResolverSource {
  agentChatSettings?: Partial<AgentChatSettings> | null
  claudeCliSettings?: Partial<ClaudeCliSettings> | null
}

export interface ResolvedAgentChatSettings extends AgentChatSettings {
  claudeCliSettings: ClaudeCliSettings
}

type ClaudeCliStringSettings = Pick<ClaudeCliSettings, 'permissionMode' | 'model' | 'effort' | 'appendSystemPrompt' | 'allowedTools' | 'disallowedTools'>
type ClaudeCliBooleanSettings = Pick<ClaudeCliSettings, 'verbose' | 'chrome' | 'worktree' | 'dangerouslySkipPermissions'>

function resolveBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function resolveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resolveString(value: string | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function resolveStringArray(value: string[] | undefined, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback]
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function resolveChoice<T extends string>(value: string | undefined, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback
}

function resolveClaudeCliStringSettings(settings?: Partial<ClaudeCliSettings> | null): ClaudeCliStringSettings {
  return {
    permissionMode: resolveString(settings?.permissionMode, CLAUDE_CLI_SETTINGS_FALLBACK.permissionMode),
    model: resolveString(settings?.model, CLAUDE_CLI_SETTINGS_FALLBACK.model),
    effort: resolveString(settings?.effort, CLAUDE_CLI_SETTINGS_FALLBACK.effort),
    appendSystemPrompt: resolveString(settings?.appendSystemPrompt, CLAUDE_CLI_SETTINGS_FALLBACK.appendSystemPrompt),
    allowedTools: resolveString(settings?.allowedTools, CLAUDE_CLI_SETTINGS_FALLBACK.allowedTools),
    disallowedTools: resolveString(settings?.disallowedTools, CLAUDE_CLI_SETTINGS_FALLBACK.disallowedTools),
  }
}

function resolveClaudeCliBooleanSettings(settings?: Partial<ClaudeCliSettings> | null): ClaudeCliBooleanSettings {
  return {
    verbose: resolveBoolean(settings?.verbose, CLAUDE_CLI_SETTINGS_FALLBACK.verbose),
    chrome: resolveBoolean(settings?.chrome, CLAUDE_CLI_SETTINGS_FALLBACK.chrome),
    worktree: resolveBoolean(settings?.worktree, CLAUDE_CLI_SETTINGS_FALLBACK.worktree),
    dangerouslySkipPermissions: resolveBoolean(
      settings?.dangerouslySkipPermissions,
      CLAUDE_CLI_SETTINGS_FALLBACK.dangerouslySkipPermissions,
    ),
  }
}

export function resolveClaudeCliSettings(settings?: Partial<ClaudeCliSettings> | null): ClaudeCliSettings {
  return {
    ...resolveClaudeCliStringSettings(settings),
    maxBudgetUsd: resolveNumber(settings?.maxBudgetUsd, CLAUDE_CLI_SETTINGS_FALLBACK.maxBudgetUsd),
    addDirs: resolveStringArray(settings?.addDirs, CLAUDE_CLI_SETTINGS_FALLBACK.addDirs),
    ...resolveClaudeCliBooleanSettings(settings),
  }
}

export function resolveAgentChatSettings(source: AgentChatSettingsResolverSource = {}): ResolvedAgentChatSettings {
  const settings = source.agentChatSettings

  return {
    defaultProvider: resolveChoice(settings?.defaultProvider, AGENT_CHAT_PROVIDERS, AGENT_CHAT_SETTINGS_DEFAULTS.defaultProvider),
    defaultVerificationProfile: resolveChoice(
      settings?.defaultVerificationProfile,
      AGENT_CHAT_VERIFICATION_PROFILES,
      AGENT_CHAT_SETTINGS_DEFAULTS.defaultVerificationProfile,
    ),
    contextBehavior: resolveChoice(
      settings?.contextBehavior,
      AGENT_CHAT_CONTEXT_BEHAVIORS,
      AGENT_CHAT_SETTINGS_DEFAULTS.contextBehavior,
    ),
    showAdvancedControls: resolveBoolean(settings?.showAdvancedControls, AGENT_CHAT_SETTINGS_DEFAULTS.showAdvancedControls),
    openDetailsOnFailure: resolveBoolean(settings?.openDetailsOnFailure, AGENT_CHAT_SETTINGS_DEFAULTS.openDetailsOnFailure),
    defaultView: resolveChoice(settings?.defaultView, AGENT_CHAT_DEFAULT_VIEWS, AGENT_CHAT_SETTINGS_DEFAULTS.defaultView),
    claudeCliSettings: resolveClaudeCliSettings(source.claudeCliSettings),
  }
}
