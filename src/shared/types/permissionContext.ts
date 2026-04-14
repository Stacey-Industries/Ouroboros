/**
 * shared/types/permissionContext.ts
 *
 * Permission context enrichment type — Wave 9 (#21).
 * Carries the richer context from a `permission_request` hook event so the
 * approval dialog can display it when the matching `pre_tool_use` fires.
 */

export interface PermissionContext {
  permissionType?: string;
  matchedRule?: string;
  rawData?: Record<string, unknown>;
}
