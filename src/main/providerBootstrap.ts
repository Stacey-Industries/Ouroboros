/**
 * providerBootstrap.ts — Wave 36 Phase B.
 *
 * Registers built-in SessionProviders at startup.  Kept in a separate file so
 * the provider modules stay out of the V8 snapshot critical path and to keep
 * mainStartup.ts under the 300-line ESLint limit.
 */

import log from './logger'
import { ClaudeSessionProvider } from './providers/claudeSessionProvider'
import { registerSessionProvider } from './providers/providerRegistry'

/** Register all built-in SessionProviders. Call once during app startup. */
export function registerBuiltinProviders(): void {
  registerSessionProvider(new ClaudeSessionProvider())
  log.info('[providers] ClaudeSessionProvider registered')
}
