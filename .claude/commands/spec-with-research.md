---
description: Research a topic first, then generate a spec for it.
argument-hint: <topic>
---

Research the topic, pin the artifact, then generate a spec.

## Step 1: Research

**Judgment override.** If the relevant docs are already in your context, skip to Step 2. Default to research for cold contexts; skipping is for clear cases.

Otherwise, dispatch `haiku-research-extractor` to gather authoritative docs — library/framework API surface, version migration notes, official patterns. Pin the artifact as context.

## Step 2: Generate spec

Use `/specplan-draft` (which itself fans out to `haiku-explorer` for codebase grounding) followed by `/specplan-review`. The spec should include requirements, design decisions, and implementation tasks informed by both the research artifact and the codebase grounding.

Honor agent tier locks — do NOT pass `model:` overrides.
