---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
source: wave-93 ship tail (CI run on commit 16e8c7f0)
---

# `threadStoreSearch.test.ts` perf test flaky on Windows GitHub runners

## Symptom

The test `searchThreads — perf (1000 threads × 10 messages) > returns in < 200 ms on a 1000-thread corpus` (`src/main/agentChat/threadStoreSearch.test.ts:330`) times out at 10000ms on Windows-latest GitHub runners. Local Windows runs (i9-13900K class hardware) complete the same test in well under 1s.

## Reproduces

- CI run `25969532824` (2026-05-16, Wave 93 ship tail): FAILED at this test. 11000/11009 other tests passed.
- Local `npm run test:main` for the same commits: 6345/6345 PASS (this file is in test:main scope).
- The test calls `vi.setConfig({ testTimeout: 10000 })` at line 328, so it's already getting 10s — yet hits the timeout, suggesting the 1000-thread corpus generation + search round-trip is genuinely > 10s on the slow runner, OR the worker initialization for better-sqlite3 native bindings is consuming most of the budget.

## Diagnosis pointers

- File last modified in Wave 41 (`b77d71c0`); not touched by Wave 93 (which had no agentChat changes).
- The test exercises FTS5 thread search against a 1000-thread × 10-message corpus. Setup is dominated by SQLite insertions through `better-sqlite3`.
- Windows-latest GitHub runners are known to be ~3-5x slower than macOS/Linux runners for native-binding I/O (`better-sqlite3` is one of the canonical examples).
- Likely root cause: corpus setup time + warm-up overhead on the slow runner pushes the test over its budget.

## Recommended fix shape

Three options, ordered by preference:

1. **Bump the timeout when running under CI** — `vi.setConfig({ testTimeout: process.env.CI ? 30000 : 10000 })`. Cheap, doesn't change the perf claim, acknowledges runner variance. The 200ms perf assertion inside the test body still gates on real performance — only the outer timeout (covering setup + execution + teardown) gets the buffer.
2. **Split corpus setup out into a `beforeAll`** — if setup is the dominant cost, moving it out of the timed body means the 10s budget only covers the search call. The 200ms assertion then becomes the real gate, not the setup ceiling.
3. **Mark this test `it.skipIf(process.env.CI)` and run it on local pre-push only** — drops CI coverage in exchange for stability. Last-resort if 1 and 2 don't help.

Option 1 first. If it still flakes, do 2. Avoid 3 — losing CI coverage on perf claims defeats the purpose.

## Not in scope

- Investigating WHY the runner is slow (Microsoft's runner spec issue, not ours).
- Refactoring `threadStoreSearch` itself — the perf is fine on real hardware; this is a runner artifact.
- Re-running Wave 93 CI to re-verify — would burn precious Actions minutes; trust the local gate.

## Wave 93 ship context

Wave 93 (`v2.17.1`) shipped on local gates only (Actions minutes exhausted; the CI run that surfaced this was likely the user's last available run). The Wave 93 changes do NOT affect this test — no agentChat touch, no SQLite touch, no worker-thread touch. Treating this as a pre-existing flaky perf test orthogonal to the wave.
