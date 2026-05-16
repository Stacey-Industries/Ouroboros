# Wave 16 — Session Primitive & Worktree Isolation
## Implementation Plan

**Version target:** v1.4.0 (minor — first user-visible parallel capability)
**Feature flag:** `sessions.worktreePerSession` (default `false` for v1.4.0, then `true` in v1.4.1)
**Upstream dependencies:** Wave 15 (telemetryStore, correlationId, outcomeObserver)
**Unblocks:** Wave 17, 20, 21, 26

---

## 1. Architecture Overview

```
src/main/session/
  ├── session.ts                   ← Session primitive + phase-gate helpers
  ├── sessionStore.ts              ← electron-store CRUD wrapper, 'sessions' key
  ├── sessionMigration.ts          ← windowSessions → sessions (idempotent)
  ├── sessionLifecycle.ts          ← created/activated/archived telemetry events
  ├── worktreeManager.ts           ← git worktree add/list/remove via execFile
  ├── worktreeManagerHelpers.ts    ← path resolver, porcelain parser, validator
  ├── windowManagerSessionHelpers.ts ← getSessionForWindow, buildWorktreeCwd, etc.
  └── index.ts                     ← barrel

src/main/ipc-handlers/worktree.ts  ← git:worktreeAdd/Remove/List channels

Modified:
  src/main/windowManager.ts        (ManagedWindow → activeSessionId)
  src/main/configSchemaTail.ts     (+sessions key + feature flag)
  src/main/config.ts               (+Session type, AppConfig.sessions)
  src/main/main.ts                 (+session store init + migration)
  src/main/ptyClaude.ts            (+worktreePath cwd resolution)
  src/main/agentChat/chatOrchestrationBridgeSend.ts (cwd from session)
  src/main/codebaseGraph/graphControllerSupport.ts (sessionId-aware key)
  src/main/ipc-handlers/git.ts     (+worktree sub-registrar)
  src/main/ipc-handlers/index.ts   (+worktree exports)
```

**Worktree path convention:** `${path.dirname(projectRoot)}/.ouroboros/worktrees/<session-id>/` — sibling to the project, outside the project tree, invisible to gitignore.

**Startup sequence (main.ts):** `runAllMigrations` → `initTelemetryStore` → `initSessionStore` → `migrateWindowSessionsToSessions` → `createWindow`.

---

## 2. Session Primitive Type

File: `src/main/session/session.ts`

```typescript
export interface SessionCostRollup {
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SessionTelemetry {
  correlationIds: string[];
  telemetrySessionId: string;
}

export interface Session {
  // Core identity (Wave 16)
  id: string;
  createdAt: string;
  lastUsedAt: string;
  archivedAt?: string;

  // Project location (Wave 16)
  projectRoot: string;
  worktreePath?: string;
  worktree: boolean;

  // Conversation linkage (Wave 16)
  conversationThreadId?: string;

  // Window restore state (Wave 16)
  tags: string[];
  bounds?: {
    x: number; y: number;
    width: number; height: number;
    isMaximized: boolean;
  };

  // Scaffolds for downstream waves
  layoutPresetId?: string;           // Wave 17 populates
  profileId?: string;                // Wave 26 populates
  activeTerminalIds: string[];
  pinnedContext?: unknown[];         // Wave 25 populates
  costRollup: SessionCostRollup;
  telemetry: SessionTelemetry;
}

export function makeSession(projectRoot: string): Session {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    lastUsedAt: now,
    projectRoot,
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
  };
}
```

---

## 3. worktreeManager Contract

```typescript
export interface WorktreeRecord {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export interface WorktreeManager {
  add(projectRoot: string, sessionId: string): Promise<{ path: string }>;
  remove(worktreePath: string): Promise<void>;
  list(projectRoot: string): Promise<WorktreeRecord[]>;
  exists(worktreePath: string): Promise<boolean>;
}
```

- All `git` calls via `execFile` (not shell), `{ cwd: projectRoot, timeout: 30000 }`.
- `add` resolves path via `worktreeManagerHelpers.resolveWorktreePath` and validates via `validateWorktreePath` (sibling placement check).
- Disk pre-check via `fs.statfs` before `add`: throw `LowDiskError` if `< 5 GB` free.
- `remove` tolerates git exit 128 (already removed) with a warning.
- `list` uses the porcelain parser in helpers.

---

## 4. Migration Plan

File: `src/main/session/sessionMigration.ts`

```typescript
export async function migrateWindowSessionsToSessions(
  getConfig, setConfig,
): Promise<{ migrated: number }>;
```

**Rules:**
1. If `sessions` is non-empty → no-op (idempotent).
2. Read `windowSessions`; if empty, create a default `Session` without projectRoot.
3. For each entry: `makeSession(entry.projectRoots[0])`, copy `bounds`, `worktree: false`.
4. Keep `windowSessions` key as deprecated fallback for two releases.
5. Never calls `worktreeManager.add` — migration preserves "operates on real working copy".

---

## 5. Phase Sequencing

### Phase A — Session primitive + store + migration (Commit 1)
- session.ts + sessionStore.ts + sessionMigration.ts + sessionLifecycle.ts + index.ts
- configSchemaTail.ts additions (+15 lines to 298)
- config.ts Session type + AppConfig.sessions
- main.ts startup hooks
- Tests for each new file

### Phase B — worktreeManager + IPC (Commit 2)
- worktreeManager.ts + worktreeManagerHelpers.ts
- ipc-handlers/worktree.ts with git:worktreeAdd/Remove/List
- ipc-handlers/git.ts + ipc-handlers/index.ts wiring
- Feature-flag gated (add fails with 'feature-flag-off' when disabled)

### Phase C — pnpm spike outcome (Commit 3)
- Run spike: better-sqlite3 + node-pty + electron-rebuild under pnpm
- Green: migrate package.json engines + scripts + lockfile
- Red: commit `roadmap/pnpm-spike.md` documenting the red result and symlink workaround
- Gates Phase D

### Phase D — ManagedWindow refactor (Commit 4)
- windowManagerSessionHelpers.ts
- windowManager.ts struct change (activeSessionId replaces projectRoot/projectRoots)
- ptyClaude.ts cwd resolution
- chatOrchestrationBridgeSend.ts cwd threading
- codebaseGraph/graphControllerSupport.ts sessionId-aware keying
- pathSecurity update to accept worktreePath as allowed root

### Phase E — Lifecycle events emitted to telemetryStore (Commit 5)
- sessionStore.upsert → emit session.created / session.activated
- sessionStore.archive → emit session.archived
- Integration test: 3 concurrent sessions produce 3 event rows

### Phase F — Background-session queue (Commit 6, optional)
- sessionQueue.ts scaffold for Wave 20 to consume

---

## 6. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Disk usage (~500 MB per worktree) | Opt-in + 5 GB free-space guard + warning telemetry |
| Native module rebuilds per worktree | Phase C spike (pnpm or symlink) |
| Graph indexer multiplication | Key by worktreePath only when differs from projectRoot |
| Migration regression | Idempotent; windowSessions kept 2 releases |
| windowManager.ts at 380 lines | Extract windowManagerSessionHelpers; net-neutral |
| Worktree path outside workspace | pathSecurity accepts session.worktreePath as allowed root |
| configSchema edge-of-limit | Sessions added to configSchemaTail (has headroom) |

---

## 7. Testing Strategy

### Unit Tests per Module

| Test File | Key Assertions |
|-----------|----------------|
| `session.test.ts` | makeSession UUID format, ISO dates, worktree:false default |
| `sessionStore.test.ts` | CRUD round-trips, archive sets archivedAt, listByProjectRoot filter |
| `sessionMigration.test.ts` | Empty/2-entry/already-migrated, bounds transfer, worktree:false |
| `sessionLifecycle.test.ts` | created/activated/archived payload shapes, flag-off no-op |
| `worktreeManager.test.ts` | add/remove/list, LowDiskError, path escape rejection |
| `worktree.test.ts` (IPC) | Flag-off, path security, happy-path round-trips |
| `windowManagerSessionHelpers.test.ts` | Null for unknown id, buildWorktreeCwd selection |

### Integration Tests

1. Three concurrent sessions on same repo → no modification leak, `git worktree list` = 3
2. Crash recovery: kill mid-session → relaunch restores without orphans
3. Telemetry lifecycle: open→activate→archive produces 3 event rows
4. Migration fidelity: 3 pre-v1.4.0 windowSessions → 3 Session records with bounds preserved

### Manual / Dogfood

- 1 author-week with flag on; 3+ parallel sessions
- Checkpoint refs per-worktree; `git worktree list` confirms isolation

---

## 8. Rollback Plan

**Flag off (default):** No worktrees created; existing sessions use real working copy. No behavioral change.

**Config rollback:** `windowSessions` key preserved; `restoreWindowSessions` falls through when `sessions` empty. Code revert is lossless.

**Orphan cleanup:** Worktrees on disk after flag-off persist; IDE logs `[worktree] orphaned path detected` on startup; Wave 20 adds a GC command.

---

## 9. Cross-Wave Stability Commitments

| Artifact | Consumed by |
|----------|-------------|
| `Session.id` | Wave 17, 20, 21, 26 |
| `Session.worktreePath` | Wave 20, 21 |
| `Session.layoutPresetId` | Wave 17 |
| `Session.profileId` | Wave 26 |
| `Session.telemetry.telemetrySessionId` | Wave 15 events.session_id join |
| `sessions` config key | Wave 17, 20 |
| `git:worktreeAdd/Remove/List` channels | Wave 20 sidebar |
| `session.created/activated/archived` events | Wave 18 orchestration tracing |

---

## 10. File Count + Line Estimate

- **New files:** 16 (10 source + 6 test)
- **Modified files:** 11
- **Total touched:** 27
- **Total lines added (net):** ~2,100
