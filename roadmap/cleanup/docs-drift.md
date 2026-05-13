# Docs drift audit

Checked every `.md` file under `docs/` and `README.md` against the live codebase (file paths, symbol names, commands, config keys, Wave status). Audit date: 2026-05-01.

---

## docs/architecture.md

- **docs/architecture.md** — claim: "5 built-in themes defined as CSS var maps in `src/renderer/themes/`" — issue: there are 7 built-in themes (`retro`, `modern`, `warp`, `cursor`, `kiro`, `light`, `high-contrast`). `glass` has never been a file in that directory.

- **docs/architecture.md** — claim: "Canvas renderer is used (not WebGL)" (under Terminal Instances rendering pattern) — issue: the terminal uses `@xterm/addon-webgl` (`WebglAddon`), loaded before `term.open()` — confirmed in `useTerminalSetup.lifecycle.ts`. Canvas renderer claim is the opposite of what ships.

- **docs/architecture.md** — claim: "internalMcp (the SSE-based ouroboros server with graph tools)… internalMcp gained a stdio transport that mirrors the SSE tool surface" (Wave 51 section) — issue: Wave 60 deleted the SSE server, the stdio bridge, and the 14-tool registry in `src/main/internalMcp/`. The standalone MCP server now lives at `src/standalone/ouroborosMcp/`. The `internalMcp.transport` config key is vestigial (accepted for back-compat, ignored). The entire Wave 51 MCP routing section describes an architecture that no longer exists.

- **docs/architecture.md** — claim: "`roadmap/wave-51-plan.md` and `roadmap/wave-51-decision.md`" (cross-reference links) — issue: both files were moved to `roadmap/_archived/`; paths no longer resolve from the repo root.

---

## docs/codemode-internalmcp-routing.md

- **docs/codemode-internalmcp-routing.md** — claim: entire doc describes Wave 51's stdio adapter wiring (`internalMcpStdioTransport.js`, `internalMcp.transport` flag, route-through-codemode, SSE fallback) — issue: Wave 60 deleted `internalMcpStdioTransport.ts` and the SSE server. The `internalMcp.transport` flag is now a no-op (see `src/main/internalMcp/CLAUDE.md`). This entire document describes a superseded architecture.

- **docs/codemode-internalmcp-routing.md** — claim: "`roadmap/wave-51-plan.md`" and "`roadmap/wave-51-decision.md`" (links in Rollback section) — issue: both files are in `roadmap/_archived/`; paths are stale.

---

## docs/context-injection.md

- **docs/context-injection.md** — claim: "**File:** `src/main/orchestration/claudeCodeContextBuilder.ts`" (Stage 7 Lean Packet Mode) — issue: the file lives at `src/main/orchestration/providers/claudeCodeContextBuilder.ts`, not directly in `orchestration/`.

---

## docs/context-ranker.md

- **docs/context-ranker.md** — claim: "serialized by `claudeCodeContextBuilder.ts:74`" — issue: same path drift as above; file is at `src/main/orchestration/providers/claudeCodeContextBuilder.ts`.

- **docs/context-ranker.md** — claim: "`contextRankerVariant.ts` — `TUNED_WEIGHTS`" — issue: the actual file is `src/main/orchestration/contextSelectorRankerVariant.ts`; no file named `contextRankerVariant.ts` exists.

- **docs/context-ranker.md** — claim: "`roadmap/wave-53b-analysis.md`" (cross-reference) — issue: the file is at `roadmap/_archived/wave-53b-analysis.md`; the path is stale.

---

## docs/data-model.md

- **docs/data-model.md** — claim: `layout.chatPrimary: boolean; // default true` in the `AppConfig` schema block — issue: `chatPrimary` was migrated away in Wave 43 (`configMigrations.ts` converts it to `immersiveChat` on first read and removes the key). It is not a live config field; listing it as part of the current schema is misleading.

---

## CLAUDE.md (repo root)

- **CLAUDE.md** — claim: "Theme definitions (retro, modern, warp, cursor, kiro, glass, light, high-contrast)" in the Folder Map — issue: no `glass.ts` theme file exists in `src/renderer/themes/`. The registered themes are `retro`, `modern`, `warp`, `cursor`, `kiro`, `light`, `high-contrast`.

---

## README.md

- **README.md** — claim: `![Screenshot](docs/assets/screenshot.png)` — issue: `docs/assets/` directory does not exist; the screenshot image is missing.

---

## docs/hook-migration.md

No high-confidence path or symbol drifts found.

---

## Docs with no drifts found

The following docs were read and no high-confidence drifts were identified:

`docs/api-contract.md`, `docs/agent-monitor-subagents.md`, `docs/authentication.md`, `docs/build.md`, `docs/chat-shell.md`, `docs/claude-md-lifecycle.md`, `docs/ecosystem.md`, `docs/hook-migration.md`, `docs/mobile-dev.md`, `docs/mobile-overview.md`, `docs/mobile-access.md`, `docs/mobile-release.md`, `docs/mobile-dispatch.md`, `docs/mobile-not-a-wrapper-checklist.md`, `docs/mobile-scope.md`, `docs/mobile-testing.md`, `docs/platform.md`, `docs/providers.md`, `docs/telemetry.md`, `docs/telemetry-parity.md`, `docs/theming.md`, `docs/v8-snapshot.md`, `docs/web-remote-access.md`
