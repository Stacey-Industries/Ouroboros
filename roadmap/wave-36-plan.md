# Wave 36 — Multi-Provider Optionality

## Implementation Plan

**Version target:** v2.4.0 (minor).
**Feature flag:** `providers.multiProvider` (default `false`; opt-in per profile).
**Dependencies:** Wave 26 (profile abstraction can carry provider).
**Reference:** `roadmap/roadmap.md:1705-1740`.

**Goal:** Ship a provider abstraction so session-spawn paths are plugin-shaped, not hardcoded per-binary. Existing `ptyClaude.ts` becomes one implementation; `ptyCodex.ts` becomes a second. Add a Gemini CLI adapter and a "compare providers" side-by-side mode.

**Prior art already on disk:**
- `src/main/ptyClaude.ts` — builds `claude` invocation args.
- `src/main/ptyCodex.ts` — builds `codex` invocation args.
- `src/main/ptyAgent.ts` — spawns the PTY for a given provider.
- `src/main/ptyAgentBridge.ts` — translates PTY output events to IPC.
- `src/main/ptyCodexCapture.ts` — Codex-specific output parsing.
- `src/main/providers.ts` — MODEL provider registry (different meaning: this is Anthropic/OpenAI/Google model catalog, not the session-spawn shape we're adding).
- `src/main/profiles/` — if it exists; grep to confirm.

**Naming clarification to avoid collisions:**
- **ModelProvider** (existing, `src/main/providers.ts`) — model catalog + API keys for direct API calls.
- **SessionProvider** (new, Wave 36) — session-spawn abstraction. Picks which CLI binary to spawn and how to translate its output stream.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **SessionProvider interface.** Define `src/main/providers/sessionProvider.ts` with `SessionProvider` interface: `id`, `label`, `spawn({prompt, projectPath, sessionId, options}): Promise<SessionHandle>`, `send(handle, text)`, `cancel(handle)`, `onEvent(handle, cb)`. `SessionHandle` carries pty session id + provider-specific metadata. Registry `providerRegistry.ts` maps `'claude' | 'codex' | 'gemini'` → instance. | `src/main/providers/sessionProvider.ts` (types), `providerRegistry.ts` (map), tests |
| B | **Claude adapter.** Refactor existing `ptyClaude.ts` + `ptyAgent.ts` + `ptyAgentBridge.ts` into `src/main/providers/claudeSessionProvider.ts` implementing `SessionProvider`. All existing callers keep working via a thin shim that delegates to the provider registry. Zero behavior change. | `claudeSessionProvider.ts` (wraps existing), shim in original files if call sites are pervasive |
| C | **Codex adapter.** `src/main/providers/codexSessionProvider.ts` — wraps `ptyCodex.ts` + `ptyCodexCapture.ts`. Translates Codex stream format to the common `SessionEvent` shape from Phase A. Known Codex quirks documented inline. | `codexSessionProvider.ts`, tests |
| D | **Gemini CLI adapter.** `src/main/providers/geminiSessionProvider.ts` — wraps the `gemini` CLI binary spawn. Probably ~60-80% feature parity at best. Document tool-call handling gaps. | `geminiSessionProvider.ts`, tests, doc callout |
| E | **Profile integration.** Extend `profileStore.ts` (or equivalent — grep) to carry a `providerId: 'claude' \| 'codex' \| 'gemini'` field. Default `'claude'`. When spawning a session from a profile, the runner consults `providerId` → picks the right `SessionProvider` from the registry. Config flag `providers.multiProvider` gates whether the profile picker shows non-Claude options. | `profileStore.ts`, `sessionManager*` spawn path, config schema, tests |
| F | **Compare-providers mode.** `src/renderer/components/AgentChat/CompareProviders.tsx` — triggered via command palette (`agent-ide:compare-providers`) or composer overflow. Prompts for a second provider, spawns two parallel sessions with the same prompt, renders output in side-by-side panes. First-to-complete shows a "compare diff" summary. Reuse MobileBottomSheet on mobile (stack view). | `CompareProviders.tsx`, command registration, tests |
| G | **Docs + e2e.** `docs/providers.md` covers: enabling flag, adding a Codex/Gemini profile, compare mode, known gaps per provider. E2E smoke for compare mode (desktop). | `docs/providers.md`, `e2e/compare-providers.spec.ts` |

---

## Architecture notes

**SessionProvider shape (Phase A):**
```ts
export interface SessionEvent {
  type: 'stdout' | 'stderr' | 'tool-use' | 'completion' | 'error' | 'cost-update';
  sessionId: string;
  payload: unknown;   // type narrowed per event type
  at: number;         // ms epoch
}

export interface SpawnOptions {
  prompt: string;
  projectPath: string;
  sessionId: string;  // pre-allocated by caller
  resumeThreadId?: string;
  profile?: ProfileSnapshot;   // for model, tools, permissions
}

export interface SessionHandle {
  id: string;
  providerId: string;
  ptySessionId: string;
  startedAt: number;
  status: 'starting' | 'ready' | 'closed';
}

export interface SessionProvider {
  readonly id: string;
  readonly label: string;
  readonly binary: string;
  checkAvailability(): Promise<{ available: boolean; reason?: string }>;  // is the CLI installed?
  spawn(opts: SpawnOptions): Promise<SessionHandle>;
  send(handle: SessionHandle, text: string): Promise<void>;
  cancel(handle: SessionHandle): Promise<void>;
  onEvent(handle: SessionHandle, cb: (e: SessionEvent) => void): () => void;
}
```

**Happy-path-first mandate (risk mitigation):**
Providers differ in: tool-call shape, thinking-block markers, cost telemetry, resume semantics, permission model. For Wave 36, the common `SessionEvent` shape covers: text streaming, final completion, cost (if emitted). Provider-specific features (e.g. Codex tool traces, Gemini multimodal) are exposed via `payload` object, not standardized across providers. Document in each adapter's header what it intentionally doesn't translate.

**Backwards compat (Phase B):**
Existing call sites invoke `ptyAgent.ts` directly. The refactor introduces a registry lookup; call sites that import `ptyAgent` get a thin shim that routes through the registry by default provider id `'claude'`. This keeps Waves 15–35 code working without a sweeping refactor.

**Compare mode (Phase F):**
Two parallel session spawns with the same prompt. Each renders in its own pane. A compare header shows provider labels + cost + completion time. After both finish, a "show diff" button renders a per-word diff between the two outputs (simple diff-match-patch or string-diff implementation). This is a research/comparison tool — no persistence, no thread creation, ephemeral.

**Mobile considerations:**
Compare mode side-by-side doesn't fit phone viewport. Mobile renders stacked (vertical). MobileBottomSheet pattern from Wave 32 is a natural home.

---

## Risks

- **Codex / Gemini CLI instability.** These CLIs evolve faster than Claude Code. Mitigation: adapters are thin; if a CLI changes its output format, only that adapter file updates.
- **Auth differences.** Claude uses CLI-managed OAuth (our constraint — `user_auth_subscription.md` memory: Max sub, no API key). Codex + Gemini use API keys, which may not align with our subscription-only stance. **Do NOT add API-key management UI in this wave** — out of scope per roadmap.md:1725. Adapters assume auth is handled externally (env vars, CLI's own config files).
- **Binary availability.** `gemini` CLI isn't installed by default. `checkAvailability()` guards against "spawn failed" confusion — profiles referring to an unavailable provider show a clear error.
- **Compare mode cost.** Two simultaneous agent turns double the API spend. Warn user in the UI before starting.
- **Regression in Claude path.** Phase B refactor is the largest risk. Mitigation: shim preserves exact public API; tests assert byte-level equivalent behavior.

---

## Acceptance

- Create a Codex profile → spawn a session → turn completes with output streamed to chat.
- Create a Gemini profile → spawn a session (if `gemini` CLI is installed; else `checkAvailability` shows clear error).
- Compare-providers mode: same prompt to Claude + Codex, side-by-side output, completion-time displayed, diff button shows per-word diff.
- No regression on the default Claude path — existing chat works identically.
- `tsc`, `lint`, full vitest all green.

---

## Non-scope (explicit)

- API key management UI (out per roadmap).
- Feature parity across providers (e.g. provider-specific tools, thinking blocks).
- Persistent cross-provider comparison (compare mode is ephemeral).
- Provider marketplace (Wave 37 handles themes/prompts marketplace; third-party providers would be a much larger security surface).

---

## Per-phase commit format

`feat: Wave 36 Phase X — short summary`

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase G.
