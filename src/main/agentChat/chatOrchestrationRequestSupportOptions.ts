/**
 * chatOrchestrationRequestSupportOptions.ts — Send-options resolution helpers.
 *
 * Extracted from chatOrchestrationRequestSupportHelpers.ts to keep that file
 * under the 300-line ESLint limit. Resolves model, effort, permission mode,
 * and inference controls from settings + overrides + profile defaults.
 */

import type { ModelSlotAssignments } from '../config';
import { getConfigValue } from '../config';
import type { OrchestrationMode } from '../orchestration/types';
import { getProfileStore } from '../profiles/profileStore';
import type { ResolvedSendOptions } from './chatOrchestrationRequestSupportHelpers';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatSendMessageRequest, AgentChatSettings } from './types';

const DEFAULT_MODE: OrchestrationMode = 'edit';
const DEFAULT_CHAT_EFFORT = 'medium';
const CODEX_APP_SERVER_PERMISSION_MODES = new Set([
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions',
]);

function resolveProviderModel(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
): string {
  return provider === 'codex' ? settings.codexCliSettings.model : settings.claudeCliSettings.model;
}

function getSupportedCodexPermissionModes(): Set<string> {
  return CODEX_APP_SERVER_PERMISSION_MODES;
}

function resolvePermissionMode(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
): string {
  if (provider !== 'codex') {
    return settings.claudeCliSettings.permissionMode || 'default';
  }
  if (settings.codexCliSettings.dangerouslyBypassApprovalsAndSandbox) {
    return 'bypassPermissions';
  }
  if (settings.codexCliSettings.approvalPolicy === 'never') {
    return 'auto';
  }
  return settings.codexCliSettings.sandbox === 'read-only' ? 'plan' : 'acceptEdits';
}

function resolveModelWithSlot(
  override: string | undefined,
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  hasExplicitProviderOverride: boolean,
): string {
  const slots = getConfigValue('modelSlots') as ModelSlotAssignments | undefined;
  const slotDefault = slots?.agentChat || '';
  if (override) return override;
  if (!hasExplicitProviderOverride && slotDefault) {
    if (provider === 'codex') {
      if (slotDefault.startsWith('gpt-')) return slotDefault;
    } else if (!slotDefault.startsWith('gpt-')) {
      return slotDefault;
    }
  }
  return resolveProviderModel(settings, provider) || 'sonnet';
}

function resolveEffortAndPermission(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  overrides: NonNullable<AgentChatSendMessageRequest['overrides']> | undefined,
): { effort: string; permissionMode: string } {
  const requestedPermissionMode =
    overrides?.permissionMode || resolvePermissionMode(settings, provider);
  const permissionMode =
    provider === 'codex' && !getSupportedCodexPermissionModes().has(requestedPermissionMode)
      ? resolvePermissionMode(settings, provider)
      : requestedPermissionMode;
  return {
    effort: overrides?.effort || DEFAULT_CHAT_EFFORT,
    permissionMode,
  };
}

type InferenceControlFields = Pick<
  ResolvedSendOptions,
  'temperature' | 'maxTokens' | 'stopSequences' | 'topP' | 'topK' | 'jsonSchema' | 'allowedTools'
>;
interface ProfileInferenceDefaults {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  jsonSchema?: string | null;
  enabledTools?: string[];
}

function lookupProfile(id: string | undefined): ProfileInferenceDefaults {
  return id
    ? (getProfileStore()
        ?.listAll()
        .find((p) => p.id === id) ?? {})
    : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOverrides = Record<string, any>;

function resolveInferenceControls(
  ov: AnyOverrides,
  p: ProfileInferenceDefaults,
): InferenceControlFields {
  const toolList: string[] | undefined = ov['toolOverrides'] ?? p.enabledTools;
  const allowedTools = Array.isArray(toolList) ? toolList.join(',') : undefined;
  const jsonSchema =
    'jsonSchema' in ov ? (ov['jsonSchema'] as string | null | undefined) : p.jsonSchema;
  const temperature = ov['temperature'] !== undefined ? ov['temperature'] : p.temperature;
  const maxTokens = ov['maxTokens'] !== undefined ? ov['maxTokens'] : p.maxTokens;
  const stopSequences = ov['stopSequences'] !== undefined ? ov['stopSequences'] : p.stopSequences;
  return {
    temperature,
    maxTokens,
    stopSequences,
    topP: p.topP,
    topK: p.topK,
    jsonSchema,
    allowedTools,
  };
}

export function buildResolvedOptions(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  overrides: NonNullable<AgentChatSendMessageRequest['overrides']> | undefined,
): ResolvedSendOptions {
  const verificationProfile = overrides?.verificationProfile ?? settings.defaultVerificationProfile;
  const mode = overrides?.mode ?? DEFAULT_MODE;
  const model = resolveModelWithSlot(
    overrides?.model,
    settings,
    provider,
    Boolean(overrides?.provider),
  );
  const { effort, permissionMode } = resolveEffortAndPermission(settings, provider, overrides);
  const ovMap = (overrides ?? {}) as AnyOverrides;
  const inference = resolveInferenceControls(ovMap, lookupProfile(overrides?.profileId));
  return { provider, verificationProfile, mode, model, effort, permissionMode, ...inference };
}
