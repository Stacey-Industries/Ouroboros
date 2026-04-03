# Model Router — Deferred Work

## Layer 3: LLM Fallback (async wiring)

The Haiku classifier (`llmFallback.ts`) is built and tested but not wired into the orchestrator. It requires making `resolveSendOptions` (or its caller `sendMessageWithBridge`) async-aware for the routing path. Currently the routing is synchronous (Layers 1+2 run in <5ms). Layer 3 would add ~300ms latency on the rare prompts where both Layer 1 and Layer 2 decline.

**When to do this:** Only worth wiring if the JSONL logs show a significant number of prompts falling through both layers with no decision. Check `router-decisions.jsonl` after a week of usage.

## UI Badge

Show the routing decision in the chat UI — e.g., "(auto)" or "→ sonnet" next to the model name in `ChatControlsBar.tsx`. The `RoutingDecision` is available in the send path but isn't currently forwarded to the renderer. Options:

1. Add `routingDecision` to the thread's `latestOrchestration` link (persisted in threads.db)
2. Fire a transient IPC event (`agentChat:routingDecision`) that the controls bar listens for

Option 2 is simpler for a first pass.

## Override Logging (corrective training data)

When the user manually selects a model via the dropdown AFTER the router already made a decision, log the mismatch as a corrective training example. The detection logic: if `request.overrides.model` is set AND a `routePromptSync` call on the same prompt returns a different model, that's an override.

The `routerLogger.logOverride()` method already exists — it just needs to be called from `applyRouterOverride` when it detects the user's explicit choice differs from what the router would have picked.

## Retrain Cycle

After collecting live routing decisions in `<userData>/router-decisions.jsonl`:

1. Copy the JSONL to the repo root
2. Merge with existing `router-full-judged.jsonl` (deduplicate by promptHash)
3. Re-run `python tools/train-router.py`
4. New `router-weights.json` is produced automatically
5. Rebuild the app

The live decisions are especially valuable because they include the `previousAssistantMessage` context that the original training data lacked (all context features were zero).

## Classifier Improvements

Current macro F1 is 0.60 with `class_weight='balanced'`. Potential improvements:

- **TF-IDF features**: Replace or supplement the manual keyword counts with a small TF-IDF vocabulary (top 100-200 terms). Would capture patterns the manual word lists miss.
- **Rule engine near-miss features**: If the rule engine almost matched a rule (e.g., prompt contains "think" but not "what do you think"), encode that as a feature for the classifier.
- **Live context features**: Once `previousAssistantMessage` is flowing through the router, the 5 context features will have real signal instead of all-zeros. This alone may significantly improve HAIKU detection (H1 rule depends on context).
- **Larger training set**: The JSONL logger accumulates labeled data. After 1,000+ live routing decisions, retraining should meaningfully improve minority-class performance.

## Settings UI

The router is configurable via `routerSettings` in electron-store but there's no UI surface for it in the Settings panel yet. Add a "Model Router" subsection under the existing "AI / Models" settings tab with toggles for:

- Enable/disable router
- Paranoid mode (always Opus)
- Per-layer toggles
- Confidence threshold slider
