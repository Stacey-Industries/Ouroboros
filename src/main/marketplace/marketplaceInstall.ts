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

// ── Theme key allowlist ───────────────────────────────────────────────────────

/**
 * CSS custom property names accepted in a theme bundle payload.
 * Only lower-case letters, digits, and hyphens; must start with "--" followed
 * by at least one lower-case letter.  Rejects: uppercase, numbers at position 3,
 * arbitrary attribute names, prototype pollution keys, etc.
 */
const THEME_KEY_RE = /^--[a-z][a-z0-9-]*$/;

// ── Result type ───────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  error?: string;
  /** Present when error is 'theme-key-invalid' — lists the offending keys. */
  invalidKeys?: string[];
}

// ── Per-kind install helpers ──────────────────────────────────────────────────

function installTheme(bundle: BundleContent): InstallResult {
  const payload = bundle.payload;
  if (typeof payload !== 'object' || payload === null) {
    return { success: false, error: 'theme payload must be an object' };
  }

  // Validate every key matches the CSS custom-property allowlist.
  const payloadKeys = Object.keys(payload as Record<string, unknown>);
  const invalidKeys = payloadKeys.filter((k) => !THEME_KEY_RE.test(k));
  if (invalidKeys.length > 0) {
    return { success: false, error: 'theme-key-invalid', invalidKeys };
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

  // Wave 41 Phase C — explicit feature gate.  When the flag is off (default),
  // return a clear "disabled" error rather than the generic "not-wired" stub.
  // Flip to `true` in config once the rulesAndSkills install path is wired.
  const ecosystem = getConfigValue('ecosystem') as Record<string, unknown> | null;
  const enabled = ecosystem?.rulesAndSkillsInstallEnabled === true;
  if (!enabled) {
    return { success: false, error: 'rules-install-disabled' };
  }

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
