<!-- claude-md-auto:start -->
The CLAUDE.md is written. A few things I surfaced that weren't obvious from the file headers alone:

- The **split-file pairs** (`agentChat` ↔ `agentChatResults`, `orchestration` barrel ↔ three split files) look like independent modules but are logically one unit — always import from the top-level file, not the `*Results`/`Domain`/`Context`/`Provider` split.
- The **main-process mirror files** (`src/main/agentChat/types.ts`, `src/main/auth/types.ts`) are pure re-exports — a rename here breaks them silently since TypeScript won't error until you check the main-process build.
- `AgentChatThreadRecord` carries a `version: 1` schema field — there's migration logic downstream in `src/main/agentChat/` that depends on it, so it's not just decorative.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# shared/types/ — Cross-Process Type Boundary

Canonical type definitions for everything that crosses the main/preload/renderer process boundary. If a type is used by more than one process, it belongs here — not in `src/main/`, `src/preload/`, or `src/renderer/`.

## File Map

| File | Role |
|---|---|
| `agentChat.ts` | Core chat thread/message/streaming types. Primary import target for chat consumers. Re-exports everything from `agentChatResults.ts` at the bottom. |
| `agentChatResults.ts` | Split from `agentChat.ts` to stay under the 300-line lint limit. Contains event types (`AgentChatEvent` union), result types, and `AgentChatAPI` surface. |
| `orchestration.ts` | Barrel only — re-exports all three orchestration split files. Import from here, not from the split files directly. |
| `orchestrationDomain.ts` | Primitive discriminated unions and enums: `OrchestrationStatus`, `OrchestrationProvider`, `VerificationProfileName`, `ContextReasonKind`, `TaskRequest`, etc. |
| `orchestrationContext.ts` | Context packet types: `ContextPacket`, `LiveIdeState`, `ContextSnippet`, `DirtyBufferSnapshot`, `GitDiffHunk`. |
| `orchestrationProvider.ts` | Orchestration session state, verification results, and IPC result shapes: `OrchestrationState`, `VerificationSummary`, `TaskSessionRecord`. |
| `auth.ts` | Auth primitives: `AuthState`, `Credential` (OAuth/API key union), `AuthProvider`, device flow events. |
| `claudeConfig.ts` | Claude Code config management types: `CommandDefinition`, `RuleDefinition`, `ClaudeConfigScope`. |
| `rulesAndSkills.ts` | Rules/hooks system types: `RulesFile`, `ClaudeHookEntry`, `HookEventType`, `HooksConfig`. |
| `ruleActivity.ts` | Runtime rule/skill activity: `LoadedRule`, `SkillExecutionRecord`, `RulesActivitySnapshot`. |

## Key Patterns

### Split-file pairs — treat as one logical module
- `agentChat.ts` ↔ `agentChatResults.ts`: `agentChat.ts` re-exports everything from `agentChatResults.ts` at the bottom. Always import from `agentChat.ts`.
- `orchestration.ts` ↔ `orchestrationDomain/Context/Provider.ts`: The barrel is the public API. Files were split purely for the 300-line ESLint limit.

### Main-process mirror files
`src/main/agentChat/types.ts` and `src/main/auth/types.ts` do nothing but `export * from '@shared/types/...'`. They exist to keep existing main-process import paths valid. Renaming or removing a type here silently breaks both the renderer consumer **and** the main-side re-export.

### Type-only cross-dependencies within this directory
`orchestrationDomain.ts` imports `ImageAttachment` from `agentChat.ts`. `agentChat.ts` imports orchestration primitives from `./orchestration`. These are all `import type` — no runtime coupling.

## Gotchas

- **Never put runtime values here** — this directory is `type`-only. The one exception is `GITHUB_PKCE_SCOPES` in `auth.ts`, a `const` string shared across processes.
- **`AgentChatContentBlock`** in `agentChat.ts` has `streaming-only` fields (e.g. `startedAt` on thinking blocks) that are stripped on persist. Don't treat persisted records as having those fields.
- **`orchestration.ts` is a barrel** — do not add type definitions directly to it. Add to one of the three split files and it will be re-exported automatically.
- **`version: 1`** on `AgentChatThreadRecord` — this is a schema version for the persistence layer. Increment it deliberately; there is migration logic downstream in `src/main/agentChat/`.

## Dependencies

- No imports from `src/main/`, `src/renderer/`, or `src/preload/` — this directory must remain importable by all three.
- Consumed by: `src/main/agentChat/`, `src/main/auth/`, `src/main/orchestration/`, `src/preload/preload.ts`, `src/renderer/types/electron.d.ts`, and most renderer feature components.
