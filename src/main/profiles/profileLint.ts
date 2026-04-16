/**
 * profileLint.ts — Static analysis of Profile objects for incoherent configurations.
 *
 * Wave 26 Phase D. Called from the profileCrud IPC handler and consumed by
 * the renderer's ProfileEditor to show inline warnings.
 *
 * Rules:
 *   1. Scaffolder-like (prompt mentions generate/scaffold/create new) but no Write/Edit → warn.
 *   2. Reviewer-like (prompt mentions review/do not modify) but has Write/Edit/Bash → warn.
 *   3. Debugger-like (prompt mentions diagnose/reproduce) but no Bash → warn.
 *   4. Empty enabledTools array → warn.
 *   5. permissionMode='bypass' AND enabledTools includes Bash → error.
 */

import type { Profile } from '@shared/types/profile';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileLint {
  severity: 'warn' | 'error';
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasTools(tools: string[] | undefined, ...names: string[]): boolean {
  if (!tools) return true; // undefined = all tools allowed
  return names.some((n) => tools.includes(n));
}

function mentionsAny(text: string, ...keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ─── Individual rule checks ────────────────────────────────────────────────────

function checkScaffolderWithoutWrite(profile: Profile): ProfileLint | null {
  const prompt = profile.systemPromptAddendum ?? '';
  if (!mentionsAny(prompt, 'generate', 'scaffold', 'create new')) return null;
  if (hasTools(profile.enabledTools, 'Write', 'Edit')) return null;
  return {
    severity: 'warn',
    message: 'Scaffolder without Write/Edit is incoherent — the agent cannot write new files.',
  };
}

function checkReviewerWithModifyTools(profile: Profile): ProfileLint | null {
  const prompt = profile.systemPromptAddendum ?? '';
  if (!mentionsAny(prompt, 'review', 'do not modify')) return null;
  if (!hasTools(profile.enabledTools, 'Write', 'Edit', 'Bash')) return null;
  return {
    severity: 'warn',
    message: 'Reviewer with Write/Edit/Bash may ignore its read-only role.',
  };
}

function checkDebuggerWithoutBash(profile: Profile): ProfileLint | null {
  const prompt = profile.systemPromptAddendum ?? '';
  if (!mentionsAny(prompt, 'diagnose', 'reproduce')) return null;
  if (hasTools(profile.enabledTools, 'Bash')) return null;
  return {
    severity: 'warn',
    message: 'Debugger without Bash cannot reproduce issues or run tests.',
  };
}

function checkEmptyTools(profile: Profile): ProfileLint | null {
  if (!Array.isArray(profile.enabledTools)) return null;
  if (profile.enabledTools.length > 0) return null;
  return { severity: 'warn', message: 'No tools enabled — the agent cannot act.' };
}

function checkBypassWithBash(profile: Profile): ProfileLint | null {
  if (profile.permissionMode !== 'bypass') return null;
  if (!hasTools(profile.enabledTools, 'Bash')) return null;
  return {
    severity: 'error',
    message: 'bypass permission mode + Bash is high-risk: the agent can execute arbitrary commands without approval.',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function lintProfile(profile: Profile): ProfileLint[] {
  const rules = [
    checkScaffolderWithoutWrite,
    checkReviewerWithModifyTools,
    checkDebuggerWithoutBash,
    checkEmptyTools,
    checkBypassWithBash,
  ];
  const results: ProfileLint[] = [];
  for (const rule of rules) {
    const result = rule(profile);
    if (result) results.push(result);
  }
  return results;
}
