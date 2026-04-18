# Multi-Provider Sessions

Ouroboros supports spawning Claude Code sessions from three CLI-backed providers: **Claude** (reference), **Codex**, and **Gemini**. Each provider runs its own binary; Ouroboros translates the binary's output stream into a common event shape and routes it to the chat UI.

Multi-provider is an opt-in experimental feature. The default configuration uses Claude only.

---

## Overview

| Capability | Claude | Codex | Gemini |
|---|---|---|---|
| Text streaming | Yes | Yes | Yes |
| Tool-use events | Yes | Partial (traces only) | No |
| Multi-turn context (`--resume`) | Yes | No | No |
| Cost telemetry | Yes | Partial (no total-cost-usd) | No |
| NDJSON parsing | Structured | Structured | Heuristic |
| `checkAvailability()` guard | Yes | Yes | Yes |

Claude is the reference provider. All parity gaps are documented in [Known gaps per provider](#known-gaps-per-provider).

---

## Enabling multi-provider

1. Open **Settings** (⌘, / Ctrl+,).
2. Navigate to **Providers**.
3. Under **Session Providers**, toggle **Enable multi-provider profiles** on.

This sets `providers.multiProvider = true` in the app config. It is `false` by default.

While the flag is off, profile creation and compare mode only show Claude. The flag does not affect which model-provider API keys you configure — those are independent (see the Model Providers sub-section).

You can also set the flag via the config API:

```ts
window.electronAPI.config.set('providers', { multiProvider: true });
```

---

## Binary installation prerequisites

Each session provider requires its CLI binary to be installed and on `PATH`. Ouroboros calls `checkAvailability()` before spawning and surfaces a clear error in the UI if the binary is missing — no silent "spawn failed" confusion.

### Claude — `claude` CLI (Claude Code)

Claude Code is the reference provider. The binary is `claude`.

Install via the Claude Code documentation: <https://docs.anthropic.com/claude/docs/claude-code>

Auth is handled by the CLI's own OAuth flow — run `claude` once to authenticate. Ouroboros never touches API keys for Claude.

### Codex — `codex` CLI (OpenAI Codex CLI)

The binary is `codex`. Install globally with npm:

```bash
npm install -g @openai/codex
```

Codex uses its own auth mechanism (API key via `OPENAI_API_KEY` or its own config). Set the key before launching Ouroboros:

```bash
export OPENAI_API_KEY=sk-...
```

Ouroboros does **not** manage Codex API keys. See the [Auth caveat](#auth-caveat) below.

### Gemini — `gemini` CLI (Google Gemini CLI)

The binary is `gemini`. Install it from <https://github.com/google-gemini/gemini-cli>:

```bash
npm install -g @google/gemini-cli
```

Gemini requires `GEMINI_API_KEY` to be set in the environment:

```bash
export GEMINI_API_KEY=AIza...
```

Ouroboros does **not** manage Gemini API keys. See the [Auth caveat](#auth-caveat) below.

---

## Adding a provider profile

Provider profiles let you pin a profile to a specific CLI backend and optionally set a model, system prompt addendum, and tool list.

**Prerequisites:** enable multi-provider (see [Enabling multi-provider](#enabling-multi-provider)) and install the target CLI binary.

1. Open **Settings** → **Profiles**.
2. Click **New profile**.
3. Fill in **Name** and (optionally) **Description**.
4. Under **Provider**, choose one of:
   - **Claude** — reference provider, full parity.
   - **Codex** — OpenAI Codex CLI; single-turn only.
   - **Gemini** — Google Gemini CLI; single-turn only, no tool-use events.

   The picker shows an availability badge (✓ installed / ✗ not found) for each option. You can save a profile that targets an unavailable binary, but launching a session will fail until the binary is installed.

5. Click **Save**.

The profile is now available in the session launcher. When you start a session from it, Ouroboros selects the matching SessionProvider from the registry and spawns the correct binary.

> **Default provider:** If a profile does not specify `providerId`, it defaults to `claude`. Existing profiles created before Wave 36 continue to work unchanged.

---

## Compare-providers mode

Compare mode spawns two sessions with the same prompt and renders their output side-by-side. After both sessions complete, a **Show diff** button performs a per-word diff between the two outputs.

Compare mode is a research tool — sessions are ephemeral, not persisted as threads.

### Opening compare mode

**Command palette:**
1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux).
2. Type **Compare providers** and select the entry.

**DOM event (programmatic):**
```ts
window.dispatchEvent(new CustomEvent('agent-ide:compare-providers'));
```

**Right sidebar tab:**
When `providers.multiProvider` is on, a **Compare** tab appears in the right sidebar. Click it to open the compare panel.

### Using compare mode

1. Select **Provider A** and **Provider B** from the dropdowns. Any combination is valid (including Claude vs. Claude).
2. Enter a prompt in the shared input field.
3. Click **Compare**. Ouroboros spawns both sessions simultaneously via `compareProviders:start`.
4. Watch both panes stream output in real time.
5. When both sessions complete, click **Show diff** to see a per-word diff overlay.
6. Click **Cancel** at any time to abort both sessions.

### Cost warning

Compare mode runs two agent sessions simultaneously for every prompt you submit. Each session consumes tokens independently. **Running compare mode doubles your API spend** compared to a single session. A warning banner is shown before the first session starts.

### IPC shape (for extension authors)

```ts
// Start a compare session
const result = await window.electronAPI.compareProviders.start({
  prompt: 'Refactor this function...',
  projectPath: '/path/to/project',
  providerIds: ['claude', 'codex'],  // exactly two provider IDs
});
// result.compareId is used for events and cancel

// Listen for events from both sessions
const unlisten = window.electronAPI.compareProviders.onEvent((payload) => {
  // payload.compareId, payload.providerId, payload.event
});

// Cancel both sessions
await window.electronAPI.compareProviders.cancel(result.compareId);
unlisten();
```

---

## Known gaps per provider

### Claude (reference provider)

Full feature parity. All session features work: multi-turn context via `--resume`, tool-use events, structured NDJSON parsing, cost telemetry including `total-cost-usd`, thinking blocks (model-dependent).

### Codex

- **Single-turn only.** Codex does not support session resumption. Each session starts fresh — there is no `--resume` equivalent. Multi-turn chat is not available.
- **No `total-cost-usd`.** Cost events are emitted when the Codex CLI reports token counts, but the total-cost-usd field is absent. Token counts are available via the `cost-update` event payload.
- **Tool-use events are traces.** Codex emits tool-call traces in its output stream. The adapter surfaces these as `tool-use` events with a `payload.raw` field containing the raw trace text. They are not structured tool-call objects.
- **NDJSON parsing is structured.** Codex's output format is parsed by `ptyCodexCapture.ts`. Line-splitting behavior may differ from Claude's; edge cases are documented in that file.

### Gemini

- **Single-turn only.** Same as Codex — no session resumption.
- **No tool-use events.** The Gemini CLI does not emit tool-call events in a machine-readable format. The adapter does not surface `tool-use` events; they appear only as text in the `stdout` stream.
- **Heuristic NDJSON parsing.** The Gemini CLI does not emit strict NDJSON. The adapter (`geminiSessionProvider.ts`) uses line-by-line heuristic parsing. Output that does not parse as JSON is forwarded as a raw `stdout` event. Expect occasional parse warnings in the main process log.
- **`GEMINI_API_KEY` required at launch.** The Gemini CLI fails at startup without the key; there is no interactive auth prompt.

---

## Auth caveat

This wave does **not** add API key management UI to Ouroboros. Auth is handled entirely by each CLI's own mechanism:

| Provider | Auth mechanism |
|---|---|
| Claude | CLI-managed OAuth (`claude` auth; OAuth token stored by the CLI). |
| Codex | `OPENAI_API_KEY` environment variable, read by the `codex` CLI at startup. |
| Gemini | `GEMINI_API_KEY` environment variable, read by the `gemini` CLI at startup. |

Set environment variables before launching Ouroboros. The app inherits the launch environment; variables set after the app starts are not visible to spawned sessions.

API key management UI is deferred to a future wave (see `ai/deferred.md`).

---

## Troubleshooting

**"Provider not available" error when starting a session**

The binary is missing from `PATH`. Run `checkAvailability()` (triggered automatically when the profile picker opens) to see the exact reason. Install the binary and restart Ouroboros so it inherits the updated `PATH`.

**Codex session ends immediately with no output**

Check that `OPENAI_API_KEY` is set in the environment before launching Ouroboros. The Codex CLI exits silently without a key.

**Gemini output appears as raw text with no structured events**

This is expected — the Gemini adapter uses heuristic parsing. Structured `tool-use` events are not available. Raw text appears in the `stdout` stream and is rendered in the chat pane.

**Compare mode panes show different completion times**

This is normal — provider response latency varies. The compare header shows elapsed time per pane. The diff button activates only after both sessions reach `completion` or `error` status.
