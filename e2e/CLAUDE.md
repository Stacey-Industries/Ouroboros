# e2e/ — Playwright-electron repro harness

## When to reach for `npm run repro`

Lane B B0 for UI bugs in Agent IDE. The browser MCPs in this environment (`claude-in-chrome`, `Claude_Preview`) cannot attach to Electron's chromium renderer, so this is the autonomous repro entry point. The bug must reproduce in the built IDE (`out/main/index.js`), not only dev mode.

## The loop

```
cp e2e/_repro-template.spec.ts e2e/_repro-<slug>.spec.ts
# Edit the "AGENT EDIT" block with your repro steps
npm run repro -- <slug>
```

Read results:

- `artifacts/repro-<slug>-<ts>/summary.json` — pass/fail, timings, file paths
- `screenshot-*.png` — open in an image viewer
- `trace.zip` — drag into https://trace.playwright.dev/

## Artifact contract (`ReproSummary` — see `e2e/reproArtifacts.ts`)

Fields: `name`, `startedAt`, `finishedAt`, `durationMs`, `passed`, `screenshots` (string[]), `consoleTranscriptPath`, `tracePath` (string | null), `testFile`.

Non-obvious behaviors:

- `tracePath: null` means the renderer crashed before fixture teardown — that is diagnostic information, not a harness failure.
- `console.jsonl` is line-delimited JSON. Bootstrap-era logs (most diagnostic-relevant) are captured because the template registers listeners via `electronApp.on('window', ...)` before `firstWindow()` resolves. **Do not move the listener registration below the `firstWindow()` await when copying.**
- The template ends with `await page.close()` before fixture teardown. This is required on Windows to prevent `app.close()` from hanging. **Do not remove that line when copying.**

## Gesture examples

| Gesture                                         | Spec                           |
| ----------------------------------------------- | ------------------------------ |
| Tree clicks, sidebar/title-bar locators         | `e2e/basic-navigation.spec.ts` |
| Composer fill + send, agent-sidebar detection   | `e2e/agent-chat.spec.ts`       |
| `page.evaluate` IPC calls, CustomEvent dispatch | `e2e/diff-gutter.spec.ts`      |

## What this is NOT

- Not browser-MCP automation — `claude-in-chrome` is a Chrome extension; it cannot attach to Electron's chromium.
- Not for non-UI bugs — use the scoped vitest scripts in `package.json` (`test:main`, `test:renderer`, etc.).
- Not production diagnostics — dev-time tooling only, excluded from `npm run dist` packaging.
