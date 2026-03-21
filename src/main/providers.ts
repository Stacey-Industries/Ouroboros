import type { ModelProvider } from './config'
import { getConfigValue } from './config'

/** Built-in Anthropic provider — always available, uses CLI's own auth */
const ANTHROPIC_PROVIDER: ModelProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: '',
  apiKey: '',
  models: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', capabilities: ['reasoning'] },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', capabilities: ['coding', 'fast'] },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', capabilities: ['fast'] },
    { id: 'opus', name: 'Opus (latest)', provider: 'anthropic' },
    { id: 'sonnet', name: 'Sonnet (latest)', provider: 'anthropic' },
    { id: 'haiku', name: 'Haiku (latest)', provider: 'anthropic' },
  ],
  enabled: true,
  builtIn: true,
}

/** Preset templates for known providers — user just adds API key */
export const PROVIDER_PRESETS: Omit<ModelProvider, 'apiKey' | 'enabled'>[] = [
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/anthropic',
    builtIn: false,
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax', capabilities: ['coding', 'fast'] },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'minimax', capabilities: ['coding'] },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    builtIn: false,
    models: [],
  },
]

export function getAllProviders(): ModelProvider[] {
  const userProviders = getConfigValue('modelProviders') ?? []
  return [ANTHROPIC_PROVIDER, ...userProviders]
}

/**
 * Resolve a 'providerId:modelId' slot string into env vars for a Claude CLI spawn.
 * Returns empty object for empty/invalid inputs (no-op = existing behavior).
 */
export function resolveModelEnv(slotValue: string): Record<string, string> {
  if (!slotValue || !slotValue.includes(':')) return {}

  const colonIndex = slotValue.indexOf(':')
  const providerId = slotValue.slice(0, colonIndex)
  const modelId = slotValue.slice(colonIndex + 1)

  if (!providerId || !modelId) return {}

  const providers = getAllProviders()
  const provider = providers.find(p => p.id === providerId && p.enabled)
  if (!provider) return {}

  const env: Record<string, string> = {}

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl
  }
  if (provider.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
  }

  env.ANTHROPIC_MODEL = modelId

  if (provider.id !== 'anthropic') {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  }

  return env
}
