# Wave 73 — Architecture Decision Record

## Decision 1: Main-process accumulation (no renderer round-trip)

**Context:** Skill execution records are currently tracked only in the renderer's `AgentEventsContext` reducer. Persisting them requires getting them into the main process before the SQLite write.

**Options considered:**
- *Industry standard:* Accumulate in the main process directly from hook events (same process as the writer).
- *Emerging:* Renderer sends records back to main via IPC before turn completes.
- *Experimental:* Shared SQLite writer accessible from renderer via dedicated IPC channel.

**Pick:** Main-process accumulation — industry standard.

**Rationale:** The main process already receives every `agent_start`/`agent_end` hook event via the named pipe. Accumulating there avoids an IPC round-trip and ensures records are available even if the renderer is not yet mounted.

**Consequences:** Renderer's live `AgentEventsContext` state remains the authoritative source for in-flight turns; persisted records are the source for completed turns on reload.

---

## Decision 2: Skill detection heuristic

**Context:** Hook events do not explicitly flag skill invocations. The renderer uses `extractSkillInfo` (taskLabel starting with "/") as a heuristic.

**Options considered:**
- *Industry standard:* Reuse the same heuristic already used by the renderer dispatcher.
- *Emerging:* Add an explicit `isSkill: boolean` field to the hook payload schema.
- *Experimental:* Match against a registry of known skill names.

**Pick:** Reuse existing heuristic — industry standard for this codebase.

**Rationale:** Consistency with renderer behavior. Hook-payload schema changes are a separate protocol-level wave.

**Consequences:** Any skill whose `taskLabel` doesn't start with "/" will not be detected. Acceptable for now — the heuristic matches all existing skill invocation patterns.

---

## Decision 3: Tap placement (before suppression guard)

**Context:** `dispatchToRenderer` suppresses all hook events when a synthetic chat session is active. Skill sub-agent `agent_start` events from real named-pipe connections would be suppressed before reaching `runHookTaps`.

**Options considered:**
- *Industry standard:* Call tap before the suppression guard so skill events are captured regardless.
- *Alternative:* Route skill events through a separate non-suppressed channel.
- *Alternative:* Capture from streaming block content instead of hook events.

**Pick:** Before the suppression guard — direct, no new channels.

**Rationale:** The tap only reads from the hook payload and writes to an in-memory map — it does not forward to the renderer. Calling it before suppression has no impact on the renderer's event feed.

**Consequences:** The tap must be a pure side-effect that never routes to the renderer; that invariant must be maintained if the tap is ever extended.

---

## Decision 4: SQLite storage as TEXT column

**Context:** `skillExecutions` is an array of structured records that needs to survive app restarts alongside the assistant message.

**Options considered:**
- *Industry standard:* JSON TEXT column — same pattern as `blocks`, `tokenUsage`, `error`.
- *Emerging:* Separate `skill_executions` table with FK to `messages`.
- *Experimental:* MessagePack binary column.

**Pick:** JSON TEXT column — industry standard for this schema.

**Rationale:** Matches the existing pattern for all structured optional fields. No new table, no migration complexity, no JOIN needed.

**Consequences:** No indexed query by skill name. Acceptable — skill data is always loaded with its parent message.

---

## Decision 5: No renderer change required

**Context:** `AgentChatDetailsDrawer` already reads `message.skillExecutions` from the message record type. The field just had no value before this wave.

**Pick:** No renderer changes — field propagation is sufficient.

**Rationale:** The drawer already has the consumption path; this wave supplies the data. Adding a fallback to live `AgentEventsContext` for in-flight turns is deferred — current behavior (live state for active sessions) is already correct.

**Consequences:** Historical threads (pre-wave) will show no skill executions. Acceptable per acceptance criteria.
