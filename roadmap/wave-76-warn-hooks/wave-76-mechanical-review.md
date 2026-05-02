# Wave 76 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/future/warn-hooks-stdout-surfacing.md` (source plan; no formal waveplan-76.md)
- Diff range: `master..wave-76-warn-hooks` (2 commits: `0e2eb7e`, `feb9a90`)
- Graph: FALLBACK (codebase-memory graph unavailable; all traces via grep + import-following)
- Run timestamp: 2026-05-02T19:10Z

---

## Check 1: Forward-trace

**Change sites traced:** 5
**Paths reaching production consumer:** 5 (after fix)
**Paths flagged as dead:** 0 (1 found, fixed before report finalized)

### Finding (fixed in commit `feb9a90`)

**`message` field on `ApprovalResponse`** — threaded through the warn path but silently dropped at `notifyApprovalResolved` before reaching the pipe waiter.

- **Trace (pre-fix):** `resolveEnforcementResponse` returns `{ decision: 'approve', message }` → `respondToApproval(requestId, response)` → `writeResponseWithRetry(requestId, response.decision, { data: JSON.stringify(response) })` → `attemptFileWrite` → `notifyApprovalResolved(requestId, decision)` → `notifyWaiters(requestId, { decision })` — **message dropped**
- **Pipe path consumer:** `waitForApproval` in `ouroboros.mjs` reads `inner.message` from the pipe response, but `notifyWaiters` only received `{ decision }`, so `inner.message` was always `undefined` on the primary path.
- **File-poll fallback:** reads `JSON.parse(text)` of the full response file, so `resp.message` was intact there.
- **Reason:** `notifyApprovalResolved` took `(requestId, decision: string)` — the `message` field had no carrier through the pipe notifier chain.
- **Fix applied:** `notifyApprovalResolved` now accepts `ApprovalResponse`; `attemptFileWrite` re-parses `opts.data` (already the full serialized response) to recover the full response before notifying. Both paths now carry `message`.

### Remaining forward traces (clean)

| Symbol | Production consumer | Path |
|---|---|---|
| `resolveEnforcementResponse` | `hooks.ts:handleApprovalRequest` (IPC/event handler, runs on every pre_tool_use event) | `hooksSessionHandlers.ts` → `hooks.ts:230` → `respondToApproval` → pipe + file |
| `ApprovalResponse.message` | `waitForApproval` in `ouroboros.mjs` → `pre_tool_use.mjs:78-80` → `process.stdout.write(JSON)` | Full chain now intact after fix |
| `waitForApproval` (modified) | `pre_tool_use.mjs` (the deployed Claude Code hook script) | Single consumer, direct |
| `pre_tool_use.mjs` warn branch | Claude Code CLI reads stdout JSON, surfaces `systemMessage` to agent | Terminal production consumer |

---

## Check 2: Plan universal-quantifier cross-reference

**Universals found in plan:** 2 (minor)
**Universals where diff covers all instances:** 2
**Universals flagged as narrowed:** 0

- **"Every non-reject decision exits 0 silently"** — this was a description of pre-wave state, not a forward universal. No instances to cover.
- **"Each warn evaluator is responsible for being non-noisy"** — scoped to future evaluators; this wave adds no evaluators. No diff coverage required.

No universal-quantifier flags.

---

## Check 3: Export audit

**New exports added:** 1
**Exports with production consumers:** 1
**Exports flagged as dead:** 0

| Export | File | Production consumer |
|---|---|---|
| `resolveEnforcementResponse` | `hooksSessionHandlers.ts:61` | `hooks.ts:41` (import) + `hooks.ts:230` (call site in `handleApprovalRequest`) |

`ApprovalResponse.message` is a new field on an existing interface — not a net-new export. `waitForApproval` in `ouroboros.mjs` was modified, not net-new. Both Check 3 non-issues confirmed.

---

## Verdict

**PASS**

All three checks ran clean. Check 1 surfaced one real gap (the `message` field silently dropped at `notifyApprovalResolved` for the pipe path) that was fixed in commit `feb9a90` before this report was finalized. The wave as committed is structurally sound: `resolveEnforcementResponse` has a production consumer, the `message` field propagates end-to-end through both the pipe and file-poll paths, and the only new export has a live caller.
