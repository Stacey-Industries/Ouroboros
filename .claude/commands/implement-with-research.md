---
description: Research a topic first, then implement it.
argument-hint: <task>
---

Research the task, pin the artifact, then implement.

## Step 1: Research

**Judgment override.** If the relevant docs are already in your context (recent reads of the library API surface for this task), skip to Step 2. Default to research for cold contexts; skipping is for clear cases.

Otherwise, dispatch `haiku-research-extractor` to gather authoritative docs — library API surface, version-specific behavior, official examples. Pin the artifact as context.

## Step 2: Implement

Dispatch the appropriate implementation agent based on task shape:
- Tight-spec single-file change → `haiku-implementer`
- Cross-subsystem implementation requiring judgment → `sonnet-implementer`
- 3+ independent same-shape changes → `sonnet-batch-coordinator`

Honor agent tier locks — do NOT pass `model:` overrides. Use the research artifact to inform API choices, version-specific behavior, and best practices.
