# Ecosystem — Wave 37 Feature Reference

Ouroboros ships five ecosystem features that deepen the IDE's integration with Claude Code's workflow: surfacing what the model sees, tracking how it changes over versions, recording what it costs, extending it with curated bundles, and providing an in-app reference for the broader Claude Code ecosystem.

The features are largely independent and all additive. You can use any subset — none require the others.

Ecosystem features ship as always-on code; the 'moat' label is a theme, not a config flag. The `ecosystem` config key stores persistent metadata (`lastSeenSnapshot`, `lastExport`, `systemPrompt`) — there is no top-level enable/disable gate.

---

## Overview

| Feature | Access | Phase |
|---|---|---|
| System prompt transparency | Settings → AI Agents → System Prompt | A |
| Prompt diff on CLI change | Automatic — toast notification on startup | B |
| Usage export | Settings → AI Agents → Usage Export | C |
| Marketplace | Command palette → Open Marketplace | D |
| Awesome Ouroboros | Settings → AI Agents → Awesome Ouroboros | E |

---

## System Prompt Transparency

### What it does

Surfaces the resolved system prompt that Claude Code is using for the current session — read-only. The prompt is populated from the first `system` event emitted by the Claude Code CLI stream. Before the first message is sent, the prompt is not yet captured.

This lets you audit exactly what instructions the model is operating under without digging through CLI internals or hook scripts.

### How to view

- **Settings:** Settings → AI Agents → System Prompt
- **DOM event (programmatic):**
  ```ts
  window.dispatchEvent(new CustomEvent('agent-ide:show-system-prompt'));
  ```

### IPC shape

```ts
const result = await window.electronAPI.sessions.getSystemPrompt(sessionId);
// result.success === true  →  { text: string; capturedAt: number }
// result.success === false →  { reason: 'not-yet-captured' | 'unknown-session' }
```

### Caveats

- **Prompt isn't captured until the session's first message.** If you open the pane on a brand-new session that hasn't sent anything yet, the response is `{ success: false, reason: 'not-yet-captured' }`. Send one message and re-open.
- The prompt text is held in an in-memory cache only. It is never written to log files or persisted to disk.
- If the Claude Code CLI changes its stream format and stops emitting a `system` event, the pane will show "not yet captured" as a graceful fallback.

---

## Prompt Diff on CLI Version Change

### What it does

Detects when the Claude Code CLI ships a new system prompt between versions. On app startup, Ouroboros reads the current CLI version and compares the most-recently-cached prompt hash to the stored `ecosystem.lastSeenPromptHash`. If both are available and the diff exceeds the threshold, a toast notification appears.

This closes the loop on a subtle problem: a CLI upgrade can silently change the model's effective behavior. The diff view makes those changes visible before you send your next session.

### How it surfaces

A toast notification appears at startup with the message "Claude Code system prompt changed since last release" and a **View diff** link. Clicking the link opens a unified diff view showing which lines were added or removed.

### Threshold

Diffs smaller than 3 lines changed are silently logged but do not produce a notification. This avoids notification fatigue from trivial whitespace or formatting changes between CLI patch releases.

### Config keys

| Key | Meaning |
|---|---|
| `ecosystem.lastSeenPromptHash` | SHA-256 of the last-seen system prompt text |
| `ecosystem.lastSeenCliVersion` | CLI version string at the last prompt snapshot |
| `ecosystem.lastSeenPromptText` | Full prompt text (stored so the diff is reconstructable) |

These keys are managed automatically. Do not edit them by hand — incorrect values will cause spurious or missed notifications on the next startup.

---

## Usage Export

### What it does

Dumps your cost and token history to a newline-delimited JSON file (JSONL) for offline analysis, budgeting tools, or forwarding to services such as splitrail. Scope is metadata only — no prompt content, no chat messages.

### How to export

1. Open **Settings** → **AI Agents** → **Usage Export**.
2. Choose a time window: **Last 24 h**, **Last 7 d**, **Last 30 d**, or **All time**.
3. Set the output path (must be an absolute path to a writable directory).
4. Click **Export**.

The file is written immediately. A confirmation toast shows the number of rows written and the output path.

### JSONL format

One JSON object per line:

```json
{"timestamp":"2026-04-17T12:00:00.000Z","sessionId":"sess_abc123","provider":"claude","model":"claude-opus-4","inputTokens":12400,"cachedInputTokens":8000,"outputTokens":832,"costUsd":0.0421,"projectPath":"/projects/my-app","threadId":"thread_xyz"}
```

Full field reference:

| Field | Type | Description |
|---|---|---|
| `timestamp` | ISO 8601 string | When the session cost record was recorded |
| `sessionId` | string | Claude Code session identifier |
| `provider` | string | `claude`, `codex`, or `gemini` |
| `model` | string? | Model identifier if available |
| `inputTokens` | number? | Total input tokens |
| `cachedInputTokens` | number? | Prompt-cache hits (Claude only) |
| `outputTokens` | number? | Total output tokens |
| `costUsd` | number? | Estimated cost in USD |
| `projectPath` | string? | Workspace path at session start |
| `threadId` | string? | Agent chat thread identifier |

### Example queries

```bash
# All Claude sessions this week
cat export.jsonl | jq 'select(.provider == "claude")'

# Total cost per project
cat export.jsonl | jq -r '[.projectPath, .costUsd] | @tsv' | awk '{cost[$1]+=$2} END {for (p in cost) print cost[p], p}' | sort -rn

# Sessions over $0.10
cat export.jsonl | jq 'select(.costUsd != null and .costUsd > 0.10)'
```

### Notes

- The output directory must already exist. The exporter does not create directories.
- Partial token fields (`model`, `cachedInputTokens`, etc.) are `undefined`/absent for providers that do not report them (Codex, Gemini).
- The export is point-in-time. Re-export to capture sessions added after the last run.

---

## Marketplace

### What it does

Lets you browse and install curated bundles — themes, system-prompt addenda, or rules-and-skills sets — signed by the Ouroboros maintainers. Bundles are applied to the appropriate config store on install (theme → `config.theming.customTokens`; prompt → `config.systemPrompt`; rules-and-skills → the rulesAndSkills store).

### How to open

- **Command palette:** `Cmd+Shift+P` / `Ctrl+Shift+P` → **Open Marketplace**
- **DOM event (programmatic):**
  ```ts
  window.dispatchEvent(new CustomEvent('agent-ide:open-marketplace'));
  ```

### Bundle kinds

| Kind | Applies to |
|---|---|
| `theme` | `config.theming.customTokens` |
| `prompt` | `config.systemPrompt` |
| `rules-and-skills` | Rules and skills store |

### Security

Bundles are signed with Ed25519. The signature is verified in the main process before any bundle content is applied to config. Unsigned bundles, bundles with an invalid signature, and bundles whose ID appears in the revoked-bundles list are rejected with a clear error in the UI. The renderer never sees raw bundle content before verification completes.

**Placeholder key warning:** The `TRUSTED_PUBLIC_KEY_BASE64` constant in `src/main/marketplace/trustedKeys.ts` is currently set to `REPLACE_WITH_PRODUCTION_KEY` — a placeholder. The production signing key will be shipped with the first official bundle release. Until that happens, all install attempts will be rejected with a signature verification error. This is intentional behavior, not a bug.

### Manifest URL

```
https://raw.githubusercontent.com/Stacey-Industries/Ouroboros/master/marketplace/index.json
```

The revoked-bundles list lives alongside it at:

```
https://raw.githubusercontent.com/Stacey-Industries/Ouroboros/master/marketplace/revoked-bundles.json
```

### Offline behavior

If the manifest URL is unreachable at launch, the panel shows the last cached bundle list with an "Offline — showing cached results" indicator. Install is blocked until connectivity is restored.

### Constraints

- No user-submitted bundles in-app.
- No paid marketplace.
- No anonymous bundle hosting — all bundles are authored by and signed by the Ouroboros maintainer key.

---

## Awesome Ouroboros

### What it is

An in-app reference of curated hooks, slash commands, MCP configs, rules, and skills. Content is hand-maintained in `src/renderer/awesomeRef/awesomeEntries.ts` and ships with the app — no network fetch required. Entries are auditable at build time.

### How to open

- **Settings:** Settings → AI Agents → Awesome Ouroboros
- **Command palette:** `Cmd+Shift+P` / `Ctrl+Shift+P` → **Open Awesome Reference**
- **DOM event (programmatic):**
  ```ts
  window.dispatchEvent(new CustomEvent('agent-ide:open-awesome-ref'));
  ```

### Categories

| Category | What's in it |
|---|---|
| Hooks | PreToolUse / PostToolUse / PostSessionStop scripts |
| Slash commands | `.claude/commands/` snippets |
| MCP configs | `mcpServers` JSON blocks for common servers |
| Rules | `.claude/rules/` file templates |
| Skills | `.claude/skills/` file templates |

### Actions per entry

| Action | Available for |
|---|---|
| Copy to clipboard | All entry types |
| Install | Rules and skills (writes to your rules/skills store) |
| Manual placement instructions | Hooks (hook file location varies per user setup) |

Hooks cannot be auto-installed because the target directory (`~/.claude/hooks/`) is user-managed and hook scripts require executable permissions set manually. The panel shows the exact placement path and a reminder to run `chmod +x`.

### Contributing

Entries live in `src/renderer/awesomeRef/awesomeEntries.ts`. To add an entry, open a PR against the Ouroboros repo. The entry shape is:

```ts
{
  id: string;          // unique, kebab-case
  category: 'hooks' | 'commands' | 'mcp' | 'rules' | 'skills';
  title: string;
  description: string;
  author: string;
  tags: string[];
  content: string;     // the raw text to copy/install
  installAction?: {    // omit for copy-only entries
    kind: 'hook' | 'rule' | 'skill';
    payload: Record<string, unknown>;
  };
}
```

---

## Security Notes

- **System prompt content** is never written to log lines, disk, or config. It lives only in the in-memory `ptyAgentBridge` cache and in the UI render path.
- **Usage export** writes metadata only (timestamps, token counts, costs, project paths). It never includes system prompt text or chat message content.
- **Marketplace signature verification** is performed in the main process via Node's `crypto.verify('ed25519', ...)`. The renderer receives only the verification result, never raw bundle bytes.
- **Prompt diff storage** keeps the previous full prompt text in config (`ecosystem.lastSeenPromptText`) so the diff is reconstructable without a live CLI session. This field may contain sensitive project-specific context set by your CLAUDE.md files — it is stored locally and never transmitted.

---

## Troubleshooting

**System prompt pane shows "not yet captured"**

Send at least one message in the session and re-open the pane. The prompt is extracted from the first `system` event in the CLI's stream output, which only appears after the session's first turn.

**No "prompt changed" notification after a CLI upgrade**

The notification only fires if the diff between the stored prompt and the new prompt exceeds 3 lines changed. Sub-threshold changes are logged at `info` level in the main process log but suppressed from the UI. Check `%APPDATA%/Ouroboros/logs/main.log` for `[promptDiff]` entries.

**Marketplace install rejected with "signature verification failed"**

The production Ed25519 key has not yet been published. The placeholder key in `trustedKeys.ts` means all install attempts will fail until the first official bundle release ships the real key. This is expected — see the Placeholder key warning above.

**Usage export fails with "Parent directory does not exist"**

The exporter requires the output directory to exist. Create the directory first:

```bash
mkdir -p /path/to/exports
```

**Awesome Ouroboros install button greyed out for a hook entry**

Hook entries are copy-only; install is not automated. Use the **Copy** button to copy the script, then place it in `~/.claude/hooks/<EventType>/` manually and set executable permissions:

```bash
chmod +x ~/.claude/hooks/PostToolUse/auto-format.sh
```
