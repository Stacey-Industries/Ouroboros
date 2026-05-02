# TODO / FIXME / HACK Inventory

**Generated:** 2026-05-01.
**Method:** Grep across `src/**/*.{ts,tsx,js,jsx}` (excluding `*.test.ts` files) for marker keywords: `TODO`, `FIXME`, `HACK`, `XXX`, `WIP`.

---

## Summary

**Total markers in production source: 5** — all `TODO`. Zero `FIXME` / `HACK` / `XXX` / `WIP`. The codebase is unusually clean by this metric.

## TODO entries

1. **`src/main/agentChat/chatOrchestrationBridgeProgress.ts:112`**
   `// TODO: Persist skillExecutions on the assistant message.`

2. **`src/main/ipc-handlers/miscRegistrars.ts:1-3`** (file-header note)
   `// TODO: miscRegistrars.ts spans multiple unrelated domains (updater, cost, usage, crash logs, perf, shell history, symbols, approval, window, extensions). Each domain should eventually be extracted to its own named handler file (e.g. updaterHandlers.ts, costHandlers.ts, usageHandlers.ts).`

3. **`src/main/marketplace/marketplaceInstall.ts:82`**
   `// TODO (Wave 37 follow-up): wire into the rulesAndSkills install path.`
   *(Cross-ref: `ecosystem.rulesAndSkillsInstallEnabled` defaults `false` — see dead-code.md §1.6.)*

4. **`src/renderer/components/AgentChat/AgentChatTabBar.tsx:103`**
   `// TODO (Wave 32 Phase I — session cycling): mount useSwipeNavigation on the AgentChatWorkspace`
   *(Cross-ref: dead-code.md §2.7 — Wave 32 closed without this.)*

5. **`src/renderer/components/FileViewer/monacoVimMode.ts:120`**
   `// TODO: Install and integrate monaco-emacs package`
   *(Cross-ref: dead-code.md §2.4 — `enableEmacsMode` is currently a stub.)*

## Notes

- All five are intentional deferrals with clear context. None look like forgotten "I'll fix this tomorrow" notes.
- Three of the five (#3, #4, #5) are already cross-referenced from the dead-code sweep — they're not just TODOs, they correspond to actual code paths that are stubbed or branch-dead.
- The absence of `FIXME` / `HACK` / `XXX` is unusual for a 1200+ file codebase. Either the project has strict comment hygiene (likely — there's an ESLint awareness rule against console.log, and the pre-commit gate runs prettier+lint) or the markers are using a different convention (e.g., issue-tracker references, JSDoc `@deprecated`, or just inline notes without a leading marker word).
- For broader "things needing attention," see `roadmap/follow-ups/follow-ups.md` (the wave-deferral index) — that's where the project actually tracks the bulk of its incomplete work.
