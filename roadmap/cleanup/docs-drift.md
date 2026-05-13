# Docs drift audit

Checked every `.md` file under `roadmap/docs/` and `README.md` against the live codebase (file paths, symbol names, commands, config keys, Wave status). Audit date: 2026-05-01.

---

## roadmap/docs/architecture.md

- **roadmap/docs/architecture.md** — claim: "5 built-in themes defined as CSS var maps in `src/renderer/themes/`" — issue: there are 7 built-in themes (`retro`, `modern`, `warp`, `cursor`, `kiro`, `light`, `high-contrast`). `glass` has never been a file in that directory.

- **roadmap/docs/architecture.md** — claim: "Canvas renderer is used (not WebGL)" (under Terminal Instances rendering pattern) — issue: the terminal uses `@xterm/addon-webgl` (`WebglAddon`), loaded before `term.open()` — confirmed in `useTerminalSetup.lifecycle.ts`. Canvas renderer claim is the opposite of what ships.

- **roadmap/docs/architecture.md** — claim: "internalMcp (the SSE-based ouroboros server with graph tools)… internalMcp gained a stdio transport that mirrors the SSE tool surface" (Wave 51 section) — issue: Wave 60 deleted the SSE server, the stdio bridge, and the 14-tool registry in `src/main/internalMcp/`. The standalone MCP server now lives at `src/standalone/ouroborosMcp/`. The `internalMcp.transport` config key is vestigial (accepted for back-compat, ignored). The entire Wave 51 MCP routing section describes an architecture that no longer exists.

- **roadmap/docs/architecture.md** — claim: "`roadmap/wave-51-plan.md` and `roadmap/wave-51-decision.md`" (cross-reference links) — issue: both files were moved to `roadmap/_archived/`; paths no longer resolve from the repo root.

---

## roadmap/docs/codemode-internalmcp-routing.md

- **roadmap/docs/codemode-internalmcp-routing.md** — claim: entire doc describes Wave 51's stdio adapter wiring (`internalMcpStdioTransport.js`, `internalMcp.transport` flag, route-through-codemode, SSE fallback) — issue: Wave 60 deleted `internalMcpStdioTransport.ts` and the SSE server. The `internalMcp.transport` flag is now a no-op (see `src/main/internalMcp/CLAUDE.md`). This entire document describes a superseded architecture.

- **roadmap/docs/codemode-internalmcp-routing.md** — claim: "`roadmap/wave-51-plan.md`" and "`roadmap/wave-51-decision.md`" (links in Rollback section) — issue: both files are in `roadmap/_archived/`; paths are stale.

---

## roadmap/docs/context-injection.md

- **roadmap/docs/context-injection.md** — claim: "**File:** `src/main/orchestration/claudeCodeContextBuilder.ts`" (Stage 7 Lean Packet Mode) — issue: the file lives at `src/main/orchestration/providers/claudeCodeContextBuilder.ts`, not directly in `orchestration/`.

---

## roadmap/docs/context-ranker.md

- **roadmap/docs/context-ranker.md** — claim: "serialized by `claudeCodeContextBuilder.ts:74`" — issue: same path drift as above; file is at `src/main/orchestration/providers/claudeCodeContextBuilder.ts`.

- **roadmap/docs/context-ranker.md** — claim: "`contextRankerVariant.ts` — `TUNED_WEIGHTS`" — issue: the actual file is `src/main/orchestration/contextSelectorRankerVariant.ts`; no file named `contextRankerVariant.ts` exists.

- **roadmap/docs/context-ranker.md** — claim: "`roadmap/wave-53b-analysis.md`" (cross-reference) — issue: the file is at `roadmap/_archived/wave-53b-analysis.md`; the path is stale.

---

## roadmap/docs/data-model.md

- **roadmap/docs/data-model.md** — claim: `layout.chatPrimary: boolean; // default true` in the `AppConfig` schema block — issue: `chatPrimary` was migrated away in Wave 43 (`configMigrations.ts` converts it to `immersiveChat` on first read and removes the key). It is not a live config field; listing it as part of the current schema is misleading.

---

## CLAUDE.md (repo root)

- **CLAUDE.md** — claim: "Theme definitions (retro, modern, warp, cursor, kiro, glass, light, high-contrast)" in the Folder Map — issue: no `glass.ts` theme file exists in `src/renderer/themes/`. The registered themes are `retro`, `modern`, `warp`, `cursor`, `kiro`, `light`, `high-contrast`.

---

## README.md

- **README.md** — claim: `![Screenshot](roadmap/docs/assets/screenshot.png)` — issue: `roadmap/docs/assets/` directory does not exist; the screenshot image is missing.

---

## roadmap/docs/hook-migration.md

No high-confidence path or symbol drifts found.

---

## Docs with no drifts found

The following docs were read and no high-confidence drifts were identified:

`roadmap/docs/api-contract.md`, `roadmap/docs/agent-monitor-subagents.md`, `roadmap/docs/authentication.md`, `roadmap/docs/build.md`, `roadmap/docs/chat-shell.md`, `roadmap/docs/claude-md-lifecycle.md`, `roadmap/docs/ecosystem.md`, `roadmap/docs/hook-migration.md`, `roadmap/docs/mobile-dev.md`, `roadmap/docs/mobile-overview.md`, `roadmap/docs/mobile-access.md`, `roadmap/docs/mobile-release.md`, `roadmap/docs/mobile-dispatch.md`, `roadmap/docs/mobile-not-a-wrapper-checklist.md`, `roadmap/docs/mobile-scope.md`, `roadmap/docs/mobile-testing.md`, `roadmap/docs/platform.md`, `roadmap/docs/providers.md`, `roadmap/docs/telemetry.md`, `roadmap/docs/telemetry-parity.md`, `roadmap/docs/theming.md`, `roadmap/docs/v8-snapshot.md`, `roadmap/docs/web-remote-access.md`
