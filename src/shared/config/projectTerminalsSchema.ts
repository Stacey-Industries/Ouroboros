/**
 * projectTerminalsSchema.ts — Wave 94 Phase B
 *
 * Typed schema and Zod validation for per-project terminal session persistence.
 * Stored under electron-store key `terminalSessionsPerProject`.
 *
 * Design (ADR Decision 2a):
 *  - One entry per project path: which session IDs belong to each slot and
 *    which session is currently active per slot.
 *  - Stores session *references* (ID + display metadata), NOT live PTY state.
 *  - Live PTY state lives in the main-process PTY manager; this schema only
 *    tracks membership and active-session identity per project/slot.
 *  - No migration from previous data: sessions are runtime, not durable user
 *    content (per ADR Decision 2a consequences).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Session tab reference — persisted identity only, not PTY runtime state
// ---------------------------------------------------------------------------

export const SessionTabRefSchema = z.object({
  /** PTY session ID (stable across renders). */
  id: z.string(),
  /** Display title — last title received from the pty `titleChange` event. */
  title: z.string(),
  /** Whether this session runs claude CLI (affects icon / badge). */
  isClaude: z.boolean().default(false),
});

export type SessionTabRef = z.infer<typeof SessionTabRefSchema>;

// ---------------------------------------------------------------------------
// Per-project terminal state — one entry per active project
// ---------------------------------------------------------------------------

export const ProjectTerminalStateSchema = z.object({
  /** Session refs currently assigned to the primary dock slot. */
  primary: z.array(SessionTabRefSchema).default([]),
  /** Session refs currently assigned to the secondary dock slot. */
  secondary: z.array(SessionTabRefSchema).default([]),
  /** Which session is active in each slot (null = no active session). */
  activeSessionPerSlot: z
    .object({
      primary: z.string().nullable().default(null),
      secondary: z.string().nullable().default(null),
    })
    .default({ primary: null, secondary: null }),
});

export type ProjectTerminalState = z.infer<typeof ProjectTerminalStateSchema>;

// ---------------------------------------------------------------------------
// Root persisted shape: Record<projectPath, ProjectTerminalState>
// ---------------------------------------------------------------------------

export const TerminalSessionsPerProjectSchema = z.record(z.string(), ProjectTerminalStateSchema);

export type TerminalSessionsPerProject = z.infer<typeof TerminalSessionsPerProjectSchema>;

// ---------------------------------------------------------------------------
// Safe reader with fallback — used by the hook on cold-boot
// ---------------------------------------------------------------------------

export const EMPTY_PROJECT_TERMINAL_STATE: ProjectTerminalState = {
  primary: [],
  secondary: [],
  activeSessionPerSlot: { primary: null, secondary: null },
};

/**
 * Parse raw persisted data for `terminalSessionsPerProject`.
 * Returns an empty record on validation failure (corrupted data is discarded,
 * not surfaced as an error — sessions are runtime state, not durable content).
 */
export function parseTerminalSessionsPerProject(raw: unknown): TerminalSessionsPerProject {
  const result = TerminalSessionsPerProjectSchema.safeParse(raw);
  return result.success ? result.data : {};
}

/**
 * Read a single project's state from the persisted map.
 * Falls back to EMPTY_PROJECT_TERMINAL_STATE when the project has no entry.
 */
function emptyState(): ProjectTerminalState {
  return {
    primary: [],
    secondary: [],
    activeSessionPerSlot: { primary: null, secondary: null },
  };
}

export function readProjectState(
  map: TerminalSessionsPerProject,
  projectPath: string,
): ProjectTerminalState {
  const raw = map[projectPath];
  if (!raw) return emptyState();
  const result = ProjectTerminalStateSchema.safeParse(raw);
  return result.success ? result.data : emptyState();
}
