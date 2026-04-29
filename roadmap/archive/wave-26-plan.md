# Wave 26 — Profiles, Inference Controls, Tool Toggles
## Implementation Plan

**Version target:** v1.8.0 (minor)
**Feature flag:** `agentic.profiles` (default `true`)
**Dependencies:** Wave 16 (session primitive)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Profile store + built-in role presets + IPC | `profileStore.ts` (new), `rolePresets.ts` (new), `profileCrud.ts` IPC |
| B | Profile UI (Settings CRUD, per-project default, composer indicator, mid-thread switch diff) | `Settings/Profiles.tsx`, `ComposerProfile.tsx`, `ProfileDiffCard.tsx` |
| C | Inference controls (temperature, max tokens, stop sequences, JSON mode, top-p/k, effort estimator) | `InferenceControls.tsx`, bridge resolver updates |
| D | Tool toggles + MCP server toggles per chat + incoherent-set lint | `ToolToggles.tsx`, `McpChatToggles.tsx`, `profileLint.ts` |
| E | Command approval memory + terminal banner | `approvalMemory.ts` (new), `CommandApprovalBanner.tsx` |

## Profile shape

```ts
interface Profile {
  id: string;
  name: string;
  description?: string;
  model?: string;                      // e.g. 'claude-sonnet-4-6'
  effort?: 'low' | 'medium' | 'high';
  permissionMode?: 'normal' | 'plan' | 'bypass';
  systemPromptAddendum?: string;
  enabledTools?: string[];             // tool name whitelist
  mcpServers?: string[];               // MCP server ids to enable
  temperature?: number;                // 0.0 - 1.0
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  jsonSchema?: string | null;          // JSON schema for structured output
  builtIn?: boolean;                   // cannot be deleted
  createdAt: number;
  updatedAt: number;
}
```

## Role presets (Phase A)

- **Reviewer** — model: opus, effort: high, permissionMode: plan, tools: [Read, Grep, Glob], no Write/Edit/Bash. Prompt addendum: "Focus on code review; do not modify files."
- **Scaffolder** — model: sonnet, effort: medium, permissionMode: normal, tools: [Read, Write, Edit, Bash, Grep, Glob, Task]. Prompt: "Generate new code quickly; prefer idiomatic patterns."
- **Explorer** — model: sonnet, effort: low, permissionMode: normal, tools: [Read, Grep, Glob, WebSearch]. Prompt: "Answer questions; explore without modifying."
- **Debugger** — model: opus, effort: high, permissionMode: normal, tools: [Read, Edit, Bash, Grep, Glob]. Prompt: "Diagnose and fix; reproduce before editing."

## Feature flag

`agentic.profiles` (default `true`) gates the profile system. When off, sessions use global defaults (existing behavior preserved).

## Risks

- Profile bloat — cap at 50 per user; built-in presets always available
- Inference control footguns — advanced panel gated behind acknowledgment
- Approval memory security — hashed command-pattern matching, no wildcard by default

## Acceptance (wave total)

- Create profile → apply to session → inference params switch on next turn
- Per-project default persists + applies on session creation
- Profile diff on switch shows clear before/after
- Tool toggles persist per session; lint warns on incoherent sets
- Command approval banner works end-to-end with allow-once/always memory
