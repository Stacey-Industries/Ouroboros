/**
 * marketplaceInstall.ts — apply a verified bundle to the appropriate config store.
 *
 * Wave 37 Phase D — signed marketplace install paths.
 *
 * kind === 'theme'         → merge payload into config.theming.customTokens
 * kind === 'prompt'        → write payload into config.ecosystem.systemPrompt
 * kind === 'rules-and-skills' → STUB (see TODO below)
 */

import { getConfigValue, setConfigValue } from '../config';
import type { BundleContent } from './types';

// ── Result type ───────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  error?: string;
}

// ── Per-kind install helpers ──────────────────────────────────────────────────

function installTheme(bundle: BundleContent): InstallResult {
  const payload = bundle.payload;
  if (typeof payload !== 'object' || payload === null) {
    return { success: false, error: 'theme payload must be an object' };
  }
  const existing = getConfigValue('theming') as Record<string, unknown> ?? {};
  const existingTokens =
    (typeof existing.customTokens === 'object' && existing.customTokens !== null
      ? existing.customTokens
      : {}) as Record<string, string>;

  const merged = { ...existingTokens, ...(payload as Record<string, string>) };
  setConfigValue('theming', { ...existing, customTokens: merged });
  return { success: true };
}

function installPrompt(bundle: BundleContent): InstallResult {
  const payload = bundle.payload;
  if (typeof payload !== 'string') {
    return { success: false, error: 'prompt payload must be a string' };
  }
  const existing = getConfigValue('ecosystem') as Record<string, unknown> ?? {};
  setConfigValue('ecosystem', { ...existing, systemPrompt: payload });
  return { success: true };
}

function installRulesAndSkills(bundle: BundleContent): InstallResult {
  void bundle;
  // TODO(Wave 37 follow-up): wire into the rulesAndSkills install path.
  // The rulesAndSkills module (src/main/rulesAndSkills/) writes files to
  // ~/.claude/rules/ and ~/.claude/commands/ via createRuleFile /
  // createCommand.  The bundle payload shape for rules-and-skills needs to
  // be finalised before wiring — stub returns a clear error in the meantime.
  return { success: false, error: 'rules-install-not-wired' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply a verified BundleContent to the appropriate config store.
 * Never throws — all errors are returned in the result object.
 */
export function installBundle(bundle: BundleContent): InstallResult {
  try {
    switch (bundle.kind) {
      case 'theme':           return installTheme(bundle);
      case 'prompt':          return installPrompt(bundle);
      case 'rules-and-skills': return installRulesAndSkills(bundle);
      default: {
        const exhaustive: never = bundle.kind;
        return { success: false, error: `unknown bundle kind: ${String(exhaustive)}` };
      }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
