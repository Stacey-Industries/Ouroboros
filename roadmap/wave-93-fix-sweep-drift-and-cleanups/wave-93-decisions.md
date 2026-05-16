---
status: DRAFT
created: 2026-05-16
updated: 2026-05-16
wave: 93
---

# Wave 93 — Architecture Decisions

## Decision 1: Drift-check approach — option 3 (diff-and-warn script)

**Context:** Wave 92 shipped the lockfile generation foundation but `pin-toplevel.mjs` only pins top-level deps. A from-scratch `npm install` regen pulled transitive drift (`vite` 7.3.1 → 7.3.3) that broke 1077 renderer tests on macOS at first PR push. The follow-up at `roadmap/follow-ups/2026-05-16-pin-toplevel-transitive-gap.md` enumerated 4 options. We need to pick one for Wave 93.

**Options considered:**
- *Industry standard:* **Status quo + reactive `overrides`.** When a transitive bump bites, pin via `overrides`. Cheap but post-hoc — CI fails before drift is known. (Option 1 from follow-up.)
- *Industry standard (npm-aware):* **Diff-and-warn script.** Compare new lockfile against old, classify changes by severity, fail loud on minor+ before push. Doesn't prevent drift but surfaces it BEFORE the wrong artifact lands on a branch. Cheap (~60 lines). (Option 3 from follow-up.)
- *Emerging best practice:* **Snapshot-pin transitives via `overrides` at regen time.** Extend `pin-toplevel.mjs` to write a sweeping `overrides` block pinning every package to its current resolved version. Bloats `package.json` significantly (hundreds of entries); loses semver intent; fights npm's design — `overrides` is meant for surgical pinning, not bulk. (Option 2 from follow-up.)
- *Experimental:* **Migrate to pnpm.** `pnpm`'s strict mode and `package.json` adherence make transitive drift less likely. Major migration; separate initiative. (Option 4 from follow-up.)

**Pick:** Diff-and-warn script — Industry standard (npm-aware).

**Rationale:** It's the cheapest mechanism that actually catches the class of bug that bit Wave 92. The follow-up author already recommended this option. It complements the Wave 92 pre-push guard (guard catches "wrong-tool regen"; drift checker catches "right-tool but unintended drift"). It doesn't lock us into a structural change we'd need to undo later. It preserves the existing `pin-toplevel` mechanism (which works correctly within its scope — top-level deps).

**Consequences:** Wave 93 commits to (a) `scripts/lockfile-drift-check.mjs` as a permanent part of the toolchain, (b) the drift checker being wired into `lockfile-sync.mjs` such that drift blocks marker-write, (c) the `--accept-drift` flag as the human-override path. Punts: bulk-pinning via `overrides` (rejected), pnpm migration (deferred indefinitely unless WSL2 lockgen becomes unworkable).

---

## Decision 2: Drift severity gate — fail on minor+, warn on patch

**Context:** The drift checker classifies each delta as patch/minor/major/added/removed. We need a default policy on which severities should block vs warn.

**Options considered:**
- *Strict:* **Fail on any drift (patch included).** Maximum safety; most friction. Patch bumps are often security patches that we want to accept.
- *Conservative (picked):* **Fail on minor+, warn on patch.** Patch within a major version is usually safe (semver intent); minor crosses a deliberate boundary and historically introduces regressions.
- *Permissive:* **Fail on major only, warn on everything else.** Lowest friction; assumes minor bumps are safe, which Wave 92's history (a patch bump broke things) contradicts.

**Pick:** Fail on minor+, warn on patch — Conservative.

**Rationale:** The empirical signal from Wave 92 is that even patch bumps can break (vite 7.3.1 → 7.3.3). But always-failing on patch makes routine regens too costly — every npm advisory patch would block. The minor+ gate is the conservative default that catches the most likely regression class; the patch warning gives visibility without friction; `--accept-drift` is the escape hatch for genuinely-needed minor bumps.

**Consequences:** Commits to: patches go through silently with a noted warning; minor and major bumps require explicit human action. Future tightening (e.g., fail-on-patch if Wave 92's patch-regression class recurs) is a one-line change. Future loosening (e.g., warn-on-minor for routine dep maintenance) is the same. The gate is a tuning knob, not a structural choice.

---

## Decision 3: Wrapper integration — drift-check runs post-regen, gates marker-write

**Context:** The drift checker needs to hook into the existing `lockfile-sync.mjs` flow. Three integration points are plausible: pre-regen (warn the user before they wait), post-regen (warn after the artifact exists), or as a separate command the user opts into.

**Options considered:**
- *Pre-regen warning:* Run a dry-run drift estimate before regen kicks off. Can't actually predict what `npm install` will produce; only useful if we cache prior resolutions.
- *Post-regen gate (picked):* Snapshot the lockfile before regen, run drift-check after, fail and skip marker-write on non-zero exit.
- *Separate command:* `npm run lockfile:check:drift` only, user runs it manually. Forgettable — exactly the failure mode Wave 92 already had.

**Pick:** Post-regen gate.

**Rationale:** The drift checker is only useful if it runs automatically — Wave 92 already showed that "the human will remember to check" is a failed strategy. Gating marker-write is the natural integration: marker-write is the "I am willing to ship this lockfile" signal, so blocking it on drift-check is the right control point. The Wave 92 pre-push guard then enforces the absence of a marker → block push, so the marker discipline becomes the unified gate.

**Consequences:** Drift-check is no longer optional. Every `lockfile:sync` run pays the (sub-second) cost of running it. Defense in depth: drift-check is the warning layer; pre-push guard from Wave 92 is the gate. `--accept-drift` env var or flag is the escape hatch.

---

## Decision 4: `web-tree-sitter` target version — 0.26.8 (current stable)

**Context:** Agent IDE pins `web-tree-sitter@0.22.6` (ABI 13-14) but `@vscode/tree-sitter-wasm@0.3.1` ships ABI 15 grammars. The bump needs a target version. ABI 15 support landed in 0.25.0; 0.26.8 is current stable.

**Options considered:**
- *Current stable (picked):* **0.26.8.** Latest stable as of 2026-05-16.
- *Conservative (intermediate):* **0.25.x (e.g., 0.25.10).** Minimum version that supports ABI 15. Less surface change; fewer transitive bumps.
- *Pin the other side:* **Hold `web-tree-sitter` at 0.22.6, pin `@vscode/tree-sitter-wasm` down to a version that emits ABI 13/14 grammars (~0.2.x).** Hold-back strategy; not industry standard — pinning back is harder to undo than forward.

**Pick:** 0.26.8 — Current stable.

**Rationale:** Research confirms Agent IDE's API usage is `Parser.init()` + `Parser.Language.load()` only (verified at `src/main/codebaseGraph/treeSitterParser.ts:86,120`). The deprecated `Language.query()` API isn't used (grep confirmed). The ESM/CJS module-format change is the only structural risk; Phase C verifies via build + grammar-load. Forward-pinning beats holding-back: it ages well, gets security patches, doesn't accumulate as a long-term blocker.

**Consequences:** Commits to: routine `web-tree-sitter` updates from here on (Agent IDE was 4 minors behind; now current). Phase A's drift-check will fire on this bump and serves as the real-world validation of Phase A. If the bump breaks something the API check missed (e.g., ESM resolution in the vite renderer pipeline), Phase C catches it before merge.

---

## Decision 5: Trace-logging — lower to `log.debug`, not delete

**Context:** Four `log.info` calls flood the dev console with `[trace:agent-record]` and `[trace:ctx-preview]` lines. The `chat-state-architecture-overhaul` follow-up explicitly says keep them through discovery — two related bugs are still OPEN and these are live instrumentation.

**Options considered:**
- *Delete:* Removes the noise. Removes the instrumentation. Violates the explicit guidance in the open follow-up.
- *Debug-flag gate:* Add a runtime debug flag (`window.__DEBUG_TRACE__` or env var) that toggles them. Net-new mechanism; no existing pattern in the renderer to inherit.
- *Lower to `log.debug` (picked):* `electron-log`'s console transport defaults to `info`, so `debug` lines are silently dropped unless a developer sets `log.transports.console.level = 'debug'`. Zero diagnostic loss, zero new mechanism, 4-line change.

**Pick:** Lower to `log.debug`.

**Rationale:** It's the lightest-touch option that satisfies both constraints (console readable + instrumentation preserved). Consistent with `~/.claude/rules/debug-before-fix.md`: "Gate verbose debug lines behind a flag or log level." The level-gate IS the flag.

**Consequences:** Anyone investigating the open eviction bugs needs to know to set `log.transports.console.level = 'debug'` to see the traces — documented in the trace-logging follow-up. No mechanism to remove later; if the bugs close and traces are deleted, this is a clean undo.

---

## Decision 6: `SubagentTranscriptPanel` — delete, not re-mount

**Context:** The component is exported but never mounted. The Wave 47 composition tree referenced it; subsequent refactoring routed `OPEN_SUBAGENT_PANEL_EVENT` to the `monitor` tab via `useWorkbenchSurfacePolicy`'s `openUtility({ tab: 'monitor' })`. The follow-up names two options: re-mount as a distinct surface, or delete.

**Options considered:**
- *Re-mount:* Resurrect the panel as a distinct surface (separate from `monitor`). Adds back a panel that the user has lived without; fights the deliberate consolidation.
- *Delete (picked):* Remove the component, the testids, the doc references. Aligns with the consolidation.

**Pick:** Delete.

**Rationale:** The `monitor`-tab consolidation was a deliberate refactor; the dead component is the leftover. The follow-up author already recommends this option. Cole confirmed during scoping. Re-mounting would be the surprise; deletion is the obvious correctness.

**Consequences:** If a future need for a separate subagent-transcript surface emerges (distinct from the `monitor` tab), it'll be a new component, not a resurrection. The Wave 46/47 archived plans will still reference `SubagentTranscriptPanel` — that's correct historical record; archived plans aren't updated.
