# Mobile / Web Preload Scope

**Wave 41 Phase I — Explicit per-namespace decision.**

Every namespace in `ElectronAPI` is listed here with a decision:
- **Mirror** — implemented in `src/web/webPreloadApis*.ts`; all IPC calls route through the WS transport.
- **Desktop-only** — channels moved to `channelCatalog.desktopOnly.ts`; web preload returns a `desktopOnlyStub`.
- **Stub** — present in web preload but returns `{ success: false, error: 'not-available' }` (graceful degradation).

---

## Namespaces already mirrored (pre-Phase-I)

| Namespace | File | Notes |
|-----------|------|-------|
| `pty` | `webPreloadApis.ts` | Note: `pty:write/resize/kill` are catalog-reclassified to desktop-only per CRIT-1/Phase A but remain in preload for Electron builds |
| `config` | `webPreloadApis.ts` | |
| `files` | `webPreloadApis.ts` | |
| `hooks` | `webPreloadApis.ts` | |
| `app` | `webPreloadApis.ts` | |
| `shell` | `webPreloadApis.ts` | |
| `theme` | `webPreloadApis.ts` | |
| `git` | `webPreloadApis.ts` | |
| `approval` | `webPreloadApisSupplemental.ts` | |
| `sessions` | `webPreloadApisSupplemental.ts` | |
| `cost` | `webPreloadApisSupplemental.ts` | |
| `usage` | `webPreloadApisSupplemental.ts` | |
| `shellHistory` | `webPreloadApisSupplemental.ts` | |
| `updater` | `webPreloadApisSupplemental.ts` | |
| `crash` | `webPreloadApisSupplemental.ts` | |
| `perf` | `webPreloadApisSupplemental.ts` | |
| `symbol` | `webPreloadApisSupplemental.ts` | |
| `lsp` | `webPreloadApisSupplemental.ts` | |
| `window` | `webPreloadApisSupplemental.ts` | |
| `extensions` | `webPreloadApisSupplemental.ts` | |
| `mcp` | `webPreloadApisSupplemental.ts` | |
| `mcpStore` | `webPreloadApisSupplemental.ts` | |
| `extensionStore` | `webPreloadApisSupplemental.ts` | |
| `context` | `webPreloadApisSupplemental.ts` | |
| `ideTools` | `webPreloadApisSupplemental.ts` | |
| `codemode` | `webPreloadApisSupplemental.ts` | |
| `agentChat` | `webPreloadApisSupplemental.ts` | Missing: searchThreads, tags, costRollup — added Phase I |
| `orchestration` | `webPreloadApisSupplemental.ts` | |
| `contextLayer` | `webPreloadApisSupplemental.ts` | |
| `claudeMd` | `webPreloadApisClaudeMd.ts` | |
| `rulesAndSkills` | `webPreloadApisRulesSkills.ts` | |
| `mobileAccess` | `webPreloadApisSupplemental.ts` | |
| `compareProviders` | `webPreloadApisSupplemental.ts` | |
| `auth` | `webPreloadApisAuth.ts` | |
| `providers` | `webPreloadApisAuth.ts` | |
| `codex` | `webPreloadApis.ts` (via buildPtyApis) | |

---

## Phase I decisions

### Mirror (implement in web preload)

| Namespace | Rationale |
|-----------|-----------|
| `sessionCrud` | Session management is stateless w.r.t. desktop UI; mobile sidebar needs this for session list/create/archive |
| `folderCrud` | Same rationale as sessionCrud — mobile sidebar folder navigation |
| `pinnedContext` | Session pinned context is portable; mobile needs read/write for context panel |
| `profileCrud` | Profile list/select is needed on mobile to pick agent behavior |
| `layout` | Custom layout persistence per session; mobile may have its own layout presets |
| `subagent` | Mobile needs to monitor live subagent count and cancel if needed |
| `checkpoint:list` + `checkpoint:delete` + `checkpoint:onChange` | Read-only checkpoint browsing is safe on mobile |
| `marketplace:listBundles` + `marketplace:revokedIds` | Read-only marketplace browsing; install is desktop-only |
| `ecosystem` | `exportUsage` and `lastExportInfo` are data-query operations safe on mobile |
| `research:getDashboardMetrics` + mode controls | Dashboard metrics are read-only; per-session mode toggle is low-risk |
| `agentChat` additions: `searchThreads`, `setThreadTags`, `getThreadTags`, `getThreadCostRollup`, `pinThread`, `softDeleteThread`, `restoreDeletedThread`, `exportThread`, `importThread` | Complete AgentChatAPI parity |
| `agentConflict` | Read-only conflict detection needed for mobile session sidebar |
| `system2` | Push-event only; mobile can display indexing progress |
| `workspaceReadList` | Lightweight file-list CRUD; scoped per project root |
| `router` | `getStats` is a read-only analytics query |
| `workspace` | Trust queries are informational; trust mutations (`trust`/`untrust`) left as stubs — not safe from mobile |

### Desktop-only (channels reclassified in catalog)

| Namespace | Rationale |
|-----------|-----------|
| `ai:*` | All AI inline features (completion, inline-edit) require desktop editor context — no Monaco in mobile view |
| `aiStream:*` | Streaming inline edit is desktop-editor feature |
| `embedding:*` | Codebase embeddings query a full local index; results are only useful with local file access |
| `telemetry:queryEvents` | Direct telemetry DB access is a developer-only debug feature |
| `observability:exportTrace` | Trace export writes to arbitrary paths |
| `backgroundJobs:enqueue` | Long-running background jobs on mobile poorly suited (battery, connectivity); list/cancel remain mirrored |
| `checkpoint:create` + `checkpoint:restore` | Creating/restoring checkpoints involves git worktree operations — desktop-only |
| `graph:*` | Full codebase graph is heavy; building/querying requires local file index |
| `spec:scaffold` | Writes new spec files to disk; requires desktop project context |
| `perf:subscribe`/`perf:unsubscribe` | Live process metrics only meaningful on desktop |

### Stub (present but returns graceful error)

| Namespace / method | Rationale |
|--------------------|-----------|
| `approval:remember` + `approval:forget` + `approval:listMemory` | Approval memory is a session-local feature; safe to stub on mobile — the basic `respond`/`alwaysAllow` calls still work |
| `research:invoke` | LLM call with cost; keep behind feature consideration on mobile — returns `not-available` |
| `workspace:trust` + `workspace:untrust` | Trust mutations require desktop UI confirmation flow |

---

## Summary table

| Namespace | Decision | Phase I file |
|-----------|----------|-------------|
| `sessionCrud` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `folderCrud` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `pinnedContext` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `profileCrud` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `layout` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `subagent` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `checkpoint` (list/delete/onChange) | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `marketplace` (list/revoked) | Mirror | already in `webPreloadApisSupplemental.ts` additions |
| `ecosystem` | Mirror | `webPreloadApisSupplemental.ts` additions |
| `research` (dashboard + modes) | Mirror + Stub | `webPreloadApisSupplemental.ts` additions |
| `agentChat` (new methods) | Mirror | `webPreloadApisSupplemental.ts` additions |
| `agentConflict` | Mirror | `webPreloadApisSupplemental.ts` additions |
| `system2` | Mirror | `webPreloadApisSupplemental.ts` additions |
| `workspaceReadList` | Mirror | `webPreloadApisSessionCrud.ts` (new) |
| `router` | Mirror | `webPreloadApisSupplemental.ts` additions |
| `workspace` (read + stubs) | Mirror+Stub | `webPreloadApisSupplemental.ts` additions |
| `backgroundJobs` (list/cancel/onUpdate) | Mirror | `webPreloadApisSupplemental.ts` additions |
| `ai:*` | Desktop-only | catalog reclassification |
| `aiStream:*` | Desktop-only | catalog reclassification |
| `embedding:*` | Desktop-only | catalog reclassification |
| `telemetry:queryEvents` | Desktop-only | catalog reclassification |
| `observability:exportTrace` | Desktop-only | catalog reclassification |
| `backgroundJobs:enqueue` | Desktop-only | catalog reclassification |
| `checkpoint:create` + `:restore` | Desktop-only | catalog reclassification |
| `graph:*` | Desktop-only | catalog reclassification |
| `spec:scaffold` | Desktop-only | catalog reclassification |

---

## Catalog reclassifications performed

Channels moved from `channelCatalog.read.ts` / `channelCatalog.write.ts` to `channelCatalog.desktopOnly.ts`:

- `ai:generate-commit-message`, `ai:inline-completion`, `ai:inline-edit`, `ai:streamInlineEdit`, `ai:cancelInlineEditStream` (were already desktop-only in catalog — confirmed)
- `embedding:search`, `embedding:getStatus`, `embedding:getIndexStatus` → desktop-only
- `telemetry:queryEvents` → desktop-only
- `observability:exportTrace` → desktop-only
- `backgroundJobs:enqueue` → desktop-only (list/cancel/onUpdate remain paired-read/write)
- `checkpoint:create`, `checkpoint:restore` → desktop-only (list/delete/onChange remain paired-read)
- `graph:search`, `graph:getArchitecture`, `graph:traceCallPath`, `graph:getCodeSnippet` → desktop-only
- `spec:scaffold` → desktop-only
