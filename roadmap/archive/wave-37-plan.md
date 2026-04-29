# Wave 37 — Ecosystem Moat

## Implementation Plan

**Version target:** v2.4.1 (patch).
**Feature flag:** `ecosystem.moat` (default `true` — mostly additive).
**Dependencies:** Wave 26 (profile abstraction) + Wave 35 (theming overrides for marketplace bundles).
**Reference:** `roadmap/roadmap.md:1743-1778`.

**Goal:** Five small ecosystem wins bundled into one wave. Each is a "moat" move — competitors rarely ship these.

**Security constraint:** Marketplace bundles are CURATED & SIGNED only. No user-submitted content in-app. No paid marketplace. Content lives in a static repo (curated JSON) fetched over HTTPS and signature-verified on install.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **System-prompt transparency.** Read-only view surfacing the effective resolved system prompt the CLI is using for the current session. Triggered from Settings → "System Prompt (read-only)" OR `agent-ide:show-system-prompt` DOM event. Prompt content fetched via a new `sessions:getSystemPrompt(sessionId)` IPC — main-process implementation reads from the CLI's own mechanism (e.g. `claude --print-system-prompt` if it exists, or parses the session's first stream-json `system` message). Fall back to "unavailable" with reason. | `src/renderer/components/Settings/SystemPromptPane.tsx`, `src/main/ipc-handlers/systemPromptHandlers.ts`, channelCatalog entry, tests |
| B | **Prompt diff on CLI version change.** `src/main/promptDiff.ts` — tracks last-seen CLI version + last-seen resolved prompt hash. On startup, if CLI version OR prompt hash changed, emit a notification: "Claude Code system prompt changed since last release — view diff." Diff view renders side-by-side or unified per-line. Config key `ecosystem.lastSeenPromptHash` + `ecosystem.lastSeenCliVersion`. | `promptDiff.ts`, `promptDiffView.tsx` (renderer), notification integration (reuse existing toast system), tests |
| C | **splitrail integration.** Optional exporter for usage/cost data to [splitrail](https://splitrail.com) (or equivalent usage-analytics service — verify the product or make it a generic "export usage to JSONL" mechanism). `src/main/providers/splitrailExporter.ts` — given a time window, exports sessions to splitrail-format JSONL. Settings → "Export usage → splitrail" toggle + last-export timestamp. If splitrail as a specific product isn't suitable, RENAME to `usageExporter.ts` and produce a generic JSONL that users can forward anywhere. | `splitrailExporter.ts` (or `usageExporter.ts`), Settings section, IPC handler, tests |
| D | **Marketplace — curated bundles.** Single static JSON manifest at a known URL (document the URL; user will host in the Ouroboros GitHub repo's `marketplace/` folder as `index.json`). Each bundle has `{ id, title, description, author, kind: 'theme'|'prompt'|'rules-and-skills', version, signature, downloadUrl }`. Renderer: `MarketplacePanel.tsx` — list bundles, install applies to appropriate store (theme → `config.theming.customTokens`; prompt → `config.systemPrompt`; rules-and-skills → existing rulesAndSkills module). **Security:** bundles are SIGNED (Ed25519). Public key hardcoded in main. Signature verified before install. Missing / invalid signature → reject. | `src/main/marketplace/` (manifest fetch, signature verify, install apply), `src/renderer/components/Marketplace/MarketplacePanel.tsx`, command palette entry, tests |
| E | **"Awesome Ouroboros" in-app reference.** Static content page showing curated hooks, slash commands, MCP configs, rules, skills. Content lives in `src/renderer/awesomeRef/awesomeData.ts` (hand-maintained). Renderer: `AwesomeRefPanel.tsx` with search + category filter. Each entry has copy-to-clipboard or "install" button (for rules/skills/hooks — leverages existing stores). | `src/renderer/awesomeRef/awesomeData.ts`, `AwesomeRefPanel.tsx`, Settings entry + command palette, tests |
| F | **Docs + capstone.** `docs/ecosystem.md` covers each feature. Full verification. | `docs/ecosystem.md`, full verification |

---

## Architecture notes

**System prompt fetch (Phase A):**
Claude Code CLI doesn't have a documented "dump system prompt" flag. Two approaches:
1. Parse the FIRST `system` event from the session's stream-json output. Cache per-session.
2. If the CLI adds a `--print-system-prompt` flag in a future release, use that.

For Wave 37, use approach (1) — cache the first `system` event per session in `ptyAgentBridge.ts` as a side channel. Expose via `getSystemPromptForSession(sessionId)`. Phase A's IPC reads from this cache.

**Prompt diff detection (Phase B):**
On app startup:
1. Read current CLI version via `claude --version` (cached in config).
2. Spawn a throwaway session OR read from the cache populated by Phase A's mechanism during the previous session.
3. Hash the prompt (SHA-256). Compare to `config.ecosystem.lastSeenPromptHash`.
4. If different, surface a notification with a "view diff" link.
5. The diff view computes per-line diff between the stored previous prompt and the new one.

Store the previous FULL prompt (not just the hash) in config so the diff is reconstructable. Storage cost: a few KB.

**Splitrail/generic exporter (Phase C):**
Splitrail may or may not be an existing product. If the name doesn't resolve to a specific service, rename to `usageExporter.ts` and produce a generic JSONL with columns documented (`timestamp, sessionId, inputTokens, outputTokens, costUsd, provider, model`). User can forward to whatever analytics they choose.

Scope: export-only, not live streaming. User picks a window (last 24h / 7d / 30d / all). Output written to a user-chosen file OR a fixed `~/.ouroboros/exports/` folder.

**Signed marketplace (Phase D):**
- Bundles are JSON files at `https://<curated-host>/marketplace/<bundle-id>.json` + `<bundle-id>.sig` (detached Ed25519 signature).
- Public key hardcoded in `src/main/marketplace/trustedKeys.ts` (Ed25519 base64 pubkey).
- Install flow:
  1. User clicks Install on a bundle.
  2. Main-process fetches both JSON + sig.
  3. Verify signature via Node's `crypto.verify('ed25519', buf, pubKey, sigBuf)`.
  4. On fail: reject with clear error.
  5. On success: apply bundle contents to the appropriate config store.
- Revocation: a `revoked-bundles.json` at the curated host lists revoked bundle IDs. Checked on install (best-effort — not a hard gate if the file is unreachable).
- First-run: empty list until user hosts their curated repo. Document the URL schema so users can swap if they want their own.

**Awesome Ouroboros (Phase E):**
Pure static content. No fetch. `awesomeData.ts` is a maintained TypeScript module with categorized entries. Users contribute by PR to the Ouroboros repo. Keeping it code-based (not fetched JSON) means it's auditable at build-time and ships with the app.

---

## Risks

- **Claude Code doesn't expose system prompt.** Phase A's cache-first-system-event approach works, but only AFTER the first message. For sessions before the first turn, show "not yet captured — send a message to populate." Mitigation documented.
- **Signature key loss.** If the private key is lost, no new bundles can be signed. Document backup procedure for the user. This is a long-horizon ecosystem concern, not a Wave 37 blocker.
- **Marketplace offline behavior.** If the manifest URL is unreachable, show cached list + "offline" indicator. Don't crash.
- **Splitrail may not exist as a product.** Phase C falls back to generic usage JSONL. No hard dependency.
- **Prompt diff noise.** Every CLI upgrade shows a notification — if upgrades are frequent and prompt changes are tiny, this is spammy. Mitigation: only surface a notification when diff exceeds 3 lines changed. Sub-threshold changes are logged but not shown.

---

## Acceptance

- Open Settings → "System Prompt" on an active session → current prompt visible.
- Upgrade CLI → next launch shows "prompt changed" notification with viewable diff.
- Export usage → JSONL file written to disk, parseable (verify with `jq` or a small reader test).
- Marketplace: install a signed test bundle → theme/prompt/rules apply. Install an invalid-signature bundle → rejected with clear error.
- Awesome Ouroboros panel renders curated entries; copy-to-clipboard works; install buttons apply content.

---

## Per-phase commit format

`feat: Wave 37 Phase X — short summary`

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase F.
