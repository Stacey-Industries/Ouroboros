/** Expand skill templates with parameter substitution. */

import type { OrchestrationProvider } from '@shared/types/orchestrationDomain';
import type { SkillDefinition, SkillExpansionResult } from '@shared/types/rulesAndSkills';

// ─── Parameter resolution ─────────────────────────────────────────────────────

function resolveParams(
  skill: SkillDefinition,
  supplied: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = { ...supplied };
  for (const param of skill.parameters) {
    if (!(param.name in resolved) && param.default !== undefined) {
      resolved[param.name] = param.default;
    }
  }
  return resolved;
}

// ─── Substitution ─────────────────────────────────────────────────────────────

function substituteNamed(body: string, params: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    // eslint-disable-next-line security/detect-object-injection -- key from regex capture, used only for lookup
    return params[key] ?? `{{${key}}}`;
  });
}

function substitutePositional(body: string, values: string[]): string {
  let result = body;
  values.forEach((val, idx) => {
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern built from known skill parameter names
    result = result.replace(new RegExp(`\\$${idx}`, 'g'), val);
  });
  return result;
}

function substituteArguments(body: string, values: string[]): string {
  return body.replace(/\$ARGUMENTS/g, values.join(' '));
}

function applySubstitutions(body: string, params: Record<string, string>): string {
  const values = Object.values(params);
  let result = substituteArguments(body, values);
  result = substitutePositional(result, values);
  result = substituteNamed(result, params);
  return result;
}

// ─── Provider-specific formatting ────────────────────────────────────────────

function expandForClaude(
  skill: SkillDefinition,
  params: Record<string, string>,
): string {
  const body = applySubstitutions(skill.body, params);
  return `<skill name="${skill.name}" description="${skill.description}">\n${body}\n</skill>`;
}

function expandForCodex(
  skill: SkillDefinition,
  params: Record<string, string>,
): string {
  return applySubstitutions(skill.body, params);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function expandSkill(
  skill: SkillDefinition,
  params: Record<string, string>,
  provider: OrchestrationProvider,
): SkillExpansionResult {
  const resolved = resolveParams(skill, params);
  const expandedBody =
    provider === 'codex'
      ? expandForCodex(skill, resolved)
      : expandForClaude(skill, resolved);

  return { expandedBody, provider, skillId: skill.id };
}
