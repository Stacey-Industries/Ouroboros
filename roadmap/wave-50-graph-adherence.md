# Wave 50 Phase D — Graph-First Adherence Analysis

**Date:** 2026-04-28
**Decision: STAY LOG-ONLY**
**Adherence rate: 93.9%**

---

## Corpus

| Field | Value |
|---|---|
| Directory | `~/.claude/projects/C--Web-App-Agent-IDE/` |
| JSONL files scanned | 378 |
| Sessions with ≥1 Grep/Read call | 174 |
| Malformed lines skipped | 0 |
| Date range | ~2026-03-29 through 2026-04-27 |

Raw data archived at `roadmap/wave-50-graph-adherence-data.json`.

---

## Methodology

### Corpus schema

Each JSONL line is one Claude Code session event. Lines where `type === "assistant"` carry a `message.content[]` array. Items in that array with `type === "tool_use"` represent tool calls, with fields:

```json
{ "type": "tool_use", "id": "...", "name": "Grep", "input": { "pattern": "...", "path": "..." } }
```

Grep `input` keys: `pattern`, `path`, `glob`, `output_mode`.
Read `input` keys: `file_path`, `offset`, `limit`.

### Classifier (`src/main/hooks/graphUsageClassifier.ts`)

| Shape | Rule |
|---|---|
| `symbol` | Bare unquoted identifier ≥3 chars after first, no regex metacharacters — looks like a symbol name that a graph tool could answer directly |
| `literal` | Quoted string, contains regex metacharacters (`{}[]^$\|()*+?`), multi-word phrase, path-like string, or @-scoped package name — correct tool choice |
| `unknown` | Empty or missing pattern / file_path |

The `symbol` classification is deliberately conservative: only patterns that look exactly like code identifiers (camelCase, PascalCase, snake_case, ≥3 total chars) are flagged. Anything with punctuation, spaces, or operators is `literal`. This minimises false positives.

**Read calls:** All non-empty `file_path` values are `literal`. A Read with a concrete file path is always the correct tool choice. Symbol-shaped Read would mean searching for a symbol name as a file path, which doesn't happen in practice (and the corpus confirms: 0 symbol-shaped Reads).

---

## Findings

### Overall counts

| Metric | Count | % of total |
|---|---|---|
| Total Grep calls | 1,286 | 27.8% |
| Total Read calls | 3,340 | 72.2% |
| **Total Grep + Read** | **4,626** | — |
| Symbol-shaped Grep | 283 | 6.1% |
| Symbol-shaped Read | 0 | 0.0% |
| Literal-shaped | 4,343 | 93.9% |
| Unknown | 0 | 0.0% |
| **Adherence rate** | **4,343 / 4,626** | **93.9%** |

### Per-session distribution

Sessions binned by their individual adherence rate (non-symbol %):

| Bucket | Sessions |
|---|---|
| 0–20% | 0 |
| 20–40% | 0 |
| 40–60% | 1 |
| 60–80% | 8 |
| **80–100%** | **165** |

165 of 174 sessions (94.8%) have ≥80% adherence. No session fell below 59%.

### Worst-adherence sessions

| Session (8-char prefix) | Total calls | Symbol-shaped | Adherence |
|---|---|---|---|
| `439565f2` | 27 | 11 | 59.3% |
| `15a14311` | 3 | 1 | 66.7% |
| `278af56a` | 21 | 6 | 71.4% |
| `0f9f9e56` | 4 | 1 | 75.0% |
| `b7589d75` | 26 | 6 | 76.9% |

The worst session (`439565f2`) had 11 symbol-shaped Greps out of 27 calls — high for one session, but it is one outlier in 174. Even this session chose graph tools for some calls and Grep for others; the violations are not systematic across the corpus.

### Sample symbol-shaped Grep violations

All 5 captured samples came from session `01feabc3`:

```
[01feabc3] Grep: "ContextSnippetSource"
[01feabc3] Grep: "LspSubsection"
[01feabc3] Grep: "registerAiHandlers"
[01feabc3] Grep: "registerAiHandlers"
[01feabc3] Grep: "inlineCompletionsEnabled"
```

These are legitimate symbol searches. They would all be valid `search_graph` queries — but Grep also returns correct results for exact symbol names, so the tool choice is not *wrong*, only sub-optimal. The duplication (`registerAiHandlers` twice) suggests a session that searched for callers in multiple passes rather than one `trace_call_path` call. That is an efficiency gap, not a correctness failure.

---

## Threshold applied

From `roadmap/wave-50-plan.md` Phase D:

| Adherence | Decision |
|---|---|
| ≥ 70% | stay log-only |
| 40–70% | optional warn |
| < 40% | enforce |

**Actual adherence: 93.9% → STAY LOG-ONLY.**

---

## Decision

**Do not ship enforcement code this wave.**

The corpus shows agents already choose Grep and Read correctly in 93.9% of tool calls. The 6.1% symbol-shaped Greps are real (they do search for symbol names), but:

1. They represent a genuine ambiguity — Grep on a bare symbol name works and returns results. The graph tool would be faster, but neither is wrong.
2. The classifier has no way to distinguish "I need callers of this function" (graph-first violation) from "I want every line that mentions this identifier" (correct Grep use), because both look like bare identifiers.
3. Enforcement at 93.9% adherence would produce false positives on the 6.1% of calls that happen to use a pattern that looks like a symbol name but is genuinely the right tool.

The rule stays in context as `~/.claude/rules/graph-tool-routing.md` where it serves as guidance, not enforcement.

---

## What ships in Phase D

- `src/main/hooks/graphUsageClassifier.ts` — shared classifier (used by tap and analyzer)
- `src/main/hooks/graphUsageClassifier.test.ts` — 30 cases covering symbol/literal/unknown
- `src/main/hooksGraphUsageTap.ts` — arg-capture bug fixed; imports shared classifier
- `scripts/analyze-graph-adherence.ts` — corpus analyzer (reusable for future re-evaluation)
- `roadmap/wave-50-graph-adherence.md` — this document
- `roadmap/wave-50-graph-adherence-data.json` — raw JSON archive
- `hooks.enforceGraphFirst` config key added (default `false`) — reserved for future use

**No `decideEnforcement` function. No wiring into `runPreToolEnforcement`.** The `enforceGraphFirst` config key is added as a schema stub so the infrastructure is in place if a future re-run of the analyzer shifts the numbers below 70%.

---

## Follow-ups

- **Re-run quarterly.** As graph tools become more prominent in the codebase and sessions grow, the symbol-shaped fraction may shift. The analyzer is idempotent — run `npx tsx scripts/analyze-graph-adherence.ts` at any point.
- **Refine the classifier if needed.** The current BARE_IDENTIFIER heuristic has a known false-positive class: short symbol names like `foo` or `id` are classified `literal` (correct), but some 3+ char identifiers that happen to be plain English words (`path`, `name`, `type`) will be classified `symbol`. At 93.9% adherence this doesn't matter, but a stricter classifier could cross-reference against the graph's known symbol names.
- **Worst-session investigation.** Session `439565f2` is an outlier. Inspecting it manually could reveal whether those 11 symbol-shaped Greps are genuine graph-routing gaps or classifier false positives.
