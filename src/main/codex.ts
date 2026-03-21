import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import type { CodexCliSettings } from './config'

export interface CodexModelOption {
  id: string
  name: string
  description?: string
  reasoningEfforts: string[]
  contextWindow?: number
  effectiveContextWindowPercent?: number
}

interface CodexModelCacheEntry {
  slug?: string
  display_name?: string
  description?: string
  priority?: number
  visibility?: string
  supported_reasoning_levels?: Array<{ effort?: string }>
  context_window?: number
  effective_context_window_percent?: number
}

interface CodexModelsCacheFile {
  models?: CodexModelCacheEntry[]
}

const FALLBACK_CODEX_MODELS: CodexModelOption[] = [
  { id: 'gpt-5.4', name: 'gpt-5.4', description: 'Latest frontier agentic coding model.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', description: 'Smaller frontier agentic coding model.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex', description: 'Frontier Codex-optimized agentic coding model.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex', description: 'Frontier agentic coding model.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.2', name: 'gpt-5.2', description: 'Optimized for professional work and long-running agents.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.1-codex-max', name: 'gpt-5.1-codex-max', description: 'Codex-optimized model for deep and fast reasoning.', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'], contextWindow: 272000 },
  { id: 'gpt-5.1-codex-mini', name: 'gpt-5.1-codex-mini', description: 'Optimized for codex. Cheaper, faster, but less capable.', reasoningEfforts: ['medium', 'high'], contextWindow: 272000 },
]

function normalizeReasoningEfforts(entry: CodexModelCacheEntry): string[] {
  const efforts = (entry.supported_reasoning_levels ?? [])
    .map((level) => level.effort)
    .filter((effort): effort is string => typeof effort === 'string' && effort.length > 0)
  return efforts.length > 0 ? efforts : ['medium']
}

function normalizeModel(entry: CodexModelCacheEntry): CodexModelOption | null {
  if (!entry.slug) return null
  if (entry.visibility && entry.visibility !== 'list') return null

  return {
    id: entry.slug,
    name: entry.display_name || entry.slug,
    description: entry.description,
    reasoningEfforts: normalizeReasoningEfforts(entry),
    contextWindow: entry.context_window,
    effectiveContextWindowPercent: entry.effective_context_window_percent,
  }
}

function sortModels(a: CodexModelCacheEntry, b: CodexModelCacheEntry): number {
  const priorityDiff = (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
  if (priorityDiff !== 0) return priorityDiff
  return (a.display_name || a.slug || '').localeCompare(b.display_name || b.slug || '')
}

export async function listCodexModels(): Promise<CodexModelOption[]> {
  try {
    const cachePath = path.join(os.homedir(), '.codex', 'models_cache.json')
    const raw = await fs.readFile(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as CodexModelsCacheFile
    const models = (parsed.models ?? [])
      .slice()
      .sort(sortModels)
      .map(normalizeModel)
      .filter((entry): entry is CodexModelOption => entry !== null)

    if (models.length > 0) {
      const seen = new Set<string>()
      return models.filter((model) => {
        if (seen.has(model.id)) return false
        seen.add(model.id)
        return true
      })
    }
  } catch {
    // Fall back to a conservative baked-in model list.
  }

  return FALLBACK_CODEX_MODELS
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value)
}

function pushConfigOverride(args: string[], key: string, value: string): void {
  args.push('-c', `${key}=${quoteTomlString(value)}`)
}

export function mapEffortToCodexReasoning(effort: string | undefined): string | undefined {
  if (!effort) return undefined
  if (effort === 'max') return 'xhigh'
  if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh') {
    return effort
  }
  return undefined
}

export function applyCodexPermissionModeOverride(
  settings: CodexCliSettings,
  permissionMode: string | undefined,
): CodexCliSettings {
  if (!permissionMode || permissionMode === 'default') {
    return settings
  }

  if (permissionMode === 'bypassPermissions') {
    return {
      ...settings,
      dangerouslyBypassApprovalsAndSandbox: true,
    }
  }

  if (permissionMode === 'plan') {
    return {
      ...settings,
      sandbox: 'read-only',
      approvalPolicy: 'on-request',
      dangerouslyBypassApprovalsAndSandbox: false,
    }
  }

  if (permissionMode === 'acceptEdits') {
    return {
      ...settings,
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      dangerouslyBypassApprovalsAndSandbox: false,
    }
  }

  if (permissionMode === 'auto') {
    return {
      ...settings,
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      dangerouslyBypassApprovalsAndSandbox: false,
    }
  }

  return settings
}

export function buildCodexCliArgs(
  settings: CodexCliSettings,
  mode: 'interactive' | 'exec' = 'interactive',
): string[] {
  const args: string[] = []

  if (settings.model) {
    args.push('--model', settings.model)
  }
  if (settings.reasoningEffort) {
    pushConfigOverride(args, 'model_reasoning_effort', settings.reasoningEffort)
  }
  if (settings.profile) {
    args.push('--profile', settings.profile)
  }
  if (settings.dangerouslyBypassApprovalsAndSandbox) {
    args.push('--dangerously-bypass-approvals-and-sandbox')
  } else {
    args.push('--sandbox', settings.sandbox)
    if (mode === 'interactive') {
      args.push('--ask-for-approval', settings.approvalPolicy)
    } else {
      pushConfigOverride(args, 'approval_policy', settings.approvalPolicy)
    }
  }
  if (settings.search) {
    args.push('--search')
  }
  if (settings.skipGitRepoCheck) {
    args.push('--skip-git-repo-check')
  }
  for (const dir of settings.addDirs ?? []) {
    args.push('--add-dir', dir)
  }

  return args
}
