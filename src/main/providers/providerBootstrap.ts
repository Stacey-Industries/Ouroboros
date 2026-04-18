/**
 * Wave 36 — Provider bootstrap.
 *
 * Registers all built-in SessionProviders into the registry at startup.
 * Called once from `mainStartup.ts` (or equivalent) before any session is spawned.
 */

import { ClaudeSessionProvider } from './claudeSessionProvider'
import { CodexSessionProvider } from './codexSessionProvider'
import { registerSessionProvider } from './providerRegistry'

export function registerBuiltinProviders(): void {
  registerSessionProvider(new ClaudeSessionProvider())
  registerSessionProvider(new CodexSessionProvider())
}
