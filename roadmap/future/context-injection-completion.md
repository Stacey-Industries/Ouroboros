# Wave 70 (proposed) — Context injection completion

**Status:** WAVE-IT — small, bundled, high-leverage
**Source:** `roadmap/audit-verification-pass.md` Section D, items #1 and #5
**Filed:** 2026-05-01

## Summary

Two siblings on the same chat-start context-injection flow. Both are sub-10-line wire-ups of almost-shipped infrastructure. Bundling them gives a single verification window.

- **Phase A** wires `request.model` through context-layer enrichment so larger models get the richer repo-map budget that was designed for them.
- **Phase B** wires `startContextRetrainTrigger` into startup so the context ranker actually self-tunes from outcome data.

Both improvements affect only the in-IDE chat agent + orchestrated tasks, not terminal Claude Code sessions (those use the standard CLI context path: CLAUDE.md auto-load, glob-matched rules, hooks).

---

## Phase A — Thread `model:` argument into `enrichPacketWithContextLayer`

### What it does

Every chat task gets a "repo map" injected — a structured summary of your codebase's modules, signatures, and dependencies. The system has a model-aware budget table for that briefing:

| Model | Repo map budget |
|---|---|
| Opus | 16 KB / 4K tokens |
| Sonnet | 12 KB / 3K tokens |
| Default (Haiku) | 8 KB / 2K tokens |

(Source: `src/main/contextLayer/repoMapBudgets.ts`)

The contextLayer's `enrichPacket(packet, goalKeywords, model?)` accepts the model parameter (`contextLayerControllerTypes.ts:80`). The orchestration layer's caller drops it.

### What's broken

In `src/main/orchestration/contextPacketBuilder.ts:155`:

```ts
const withLayer = await enrichPacketWithContextLayer(packet, request.goal);
```

`request.model` is right there on `TaskRequest` (`shared/types/orchestrationDomain.ts:129`). It's never passed through. The contextLayer always falls back to the default (smallest) budget. **Every model — Opus, Sonnet, Haiku — gets the same 8 KB / 2K-token Haiku-sized repo map slice.**

### Fix

One line in `contextPacketBuilder.ts`:

```ts
async function enrichPacket(packet: ContextPacket, request: TaskRequest): Promise<ContextPacket> {
  const withLayer = await enrichPacketWithContextLayer(packet, request.goal, request.model);
  return enrichPacketWithSystemInstructions(withLayer, request);
}

async function enrichPacketWithContextLayer(
  packet: ContextPacket,
  goal: string,
  model?: string,
): Promise<ContextPacket> {
  // ... existing body ...
  const enriched = await layerController.enrichPacket(packet, extractGoalKeywords(goal), model);
  // ...
}
```

Plus a test that confirms Opus-tagged requests get a larger packet than Haiku-tagged requests.

### Risk surface

Negligible. The contextLayer already handles `model: undefined` (current behavior) and known model strings (new behavior). The only behavioral change is bigger-model users start getting bigger packets — which is the design intent.

---

## Phase B — Wire `startContextRetrainTrigger` at startup

### What it does

The context ranker scores files by relevance (`user_selected: 100`, `pinned: 95`, `git_diff: 56`, etc.) when picking which files go into the context packet. Outcome logs in `context-outcomes.jsonl` track which picks were actually useful. Once enough outcomes accumulate, the trainer (`tools/train-context.py`) can re-fit the scoring weights to your specific codebase.

`startContextRetrainTrigger` is the gardener that automates this. It watches the outcomes file. Once 200 new outcome rows accumulate (with a 5-minute cooldown), it spawns the trainer in the background, gets new weights, and hot-swaps them into the running classifier via `reloadContextWeights()`.

### What's broken

The function is fully implemented (260 lines + tests at `src/main/orchestration/contextRetrainTrigger.ts`), but **never called**. Zero call sites in `main.ts`, `mainStartup.ts`, or any IPC handler. The function's own JSDoc at line 234 names the intended integration point:

> *"Integration point (Phase D/later): wire into `src/main/mainStartup.ts` with paths from `app.getPath('userData')`."*

That wire-up was deferred and never landed.

### Fix

1. Add `contextRanker.autoRetrainEnabled` config flag, default `true`. Toggle for safety if it misbehaves on user machines.
2. In `src/main/mainStartup.ts` (after storage migrate, before window creation):
   - Build the four paths from `app.getPath('userData')` — `outcomesPath`, `decisionsPath`, `weightsOutPath`, `scriptPath`
   - If flag is on, call `startContextRetrainTrigger({ ... })` and stash the returned `ContextRetrainController` for shutdown cleanup
3. Hook the controller's `stop()` into the app `before-quit` lifecycle so the file watcher closes cleanly
4. Add an IPC handler exposing `controller.getStatus()` for a future Settings → Context Ranker readout
5. Update `docs/context-ranker.md` to reflect that auto-retrain is live

### Risk surface

The retrain code itself is defensive. All known failure modes already handled:
- **Python missing on user machine.** `findPython()` returns null → trigger logs `"Python not found — skipping retrain"` and exits. No crash.
- **Trainer Python script fails.** Error path captures stderr snippet, sets `lastOutcome: 'failure'`, no weight reload.
- **Concurrent retrains.** `state.isRunning` guard prevents reentry.
- **File watcher errors.** `loop.watcher.on('error', noop)` because the file may not exist yet at boot.

The only new risk is the wire-up itself, which is ~10 lines.

---

## Why bundle these two

Same chat-start context-injection flow. Same risk surface (agent-visible context shape). Same verification path: launch a session on Opus, confirm (a) repo-map budget reflects Opus tier, (b) retrain trigger fires after 200 outcomes accumulate, (c) hot-swap log line appears. Single soak window vs. two.

Both are also "almost-shipped infrastructure" — the hard parts (file watching, Python detection, classifier hot-swap, model-aware budget table) are all done and tested. Only the connecting wires are missing.

## Reject case (delete instead)

If the team decides not to ship auto-retrain (Phase B only — Phase A is a near-zero-risk hotfix):

Delete `src/main/orchestration/contextRetrainTrigger.ts`, `contextRetrainTriggerHelpers.ts`, the `.test.ts`, and `tools/train-context.py` (after verifying no other consumers). Drop `reloadContextWeights()` if it's only called by the retrain path. Remove auto-retrain mentions from `docs/context-ranker.md`.

Rejected here because the infrastructure cost has already been paid and the benefit aligns with the "amplifier not replacement" product philosophy.

## References

- **Phase A:**
  - `src/main/orchestration/contextPacketBuilder.ts:154-167` — call site to fix
  - `src/main/contextLayer/contextLayerControllerTypes.ts:77-81` — `enrichPacket` signature
  - `src/main/contextLayer/repoMapBudgets.ts` — model-aware budget table
  - `src/shared/types/orchestrationDomain.ts:129` — `TaskRequest.model`

- **Phase B:**
  - `src/main/orchestration/contextRetrainTrigger.ts:260` — function to wire
  - `src/main/orchestration/contextRetrainTriggerHelpers.ts` — helpers
  - `src/main/orchestration/contextClassifier.ts:reloadContextWeights` — hot-swap target
  - `tools/train-context.py` — trainer
  - `src/main/mainStartup.ts` — integration target

- Subsystem docs: `src/main/orchestration/CLAUDE.md`, `src/main/contextLayer/CLAUDE.md`, `docs/context-ranker.md`
- Audit: `roadmap/audit-verification-pass.md` Section D items #1, #5
