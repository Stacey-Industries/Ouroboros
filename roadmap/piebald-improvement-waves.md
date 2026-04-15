# Ouroboros Improvement Waves — Derived from Piebald Analysis

**Source:** `piebald-analysis.md`
**Status:** Planning doc — waves land incrementally, one release bump each.

---

## Part 1 — Exhaustive Improvement List

Organized by theme. Items marked **★** are gaps called out explicitly in the Piebald analysis; others are second-order ideas suggested by the comparison.

### 1. Chat UX Shape (biggest strategic gap)

1. **★ Full-width chat-only view** (Option B) — dedicated `ChatOnlyView` rendering `AgentChatWorkspace` unconstrained by the 600px sidebar cap. Toggle via `Ctrl+Shift+C`, View menu, command palette.
2. **★ Layout preset "Chat"** as a lightweight fallback — collapses left sidebar, terminal, editor; right sidebar fills window.
3. **Dedicated chat BrowserWindow** (Option C) — opt-in secondary window that shares thread state with the main IDE.
4. **Sidebar resize ceiling lift** — raise the 600px right-sidebar max when no editor is open.
5. **Chat density toggle** — compact vs comfortable spacing.

### 2. Message-Level Polish

6. **★ Message quoting** — select assistant text, "Quote" injects blockquote into composer.
7. **★ Raw markdown toggle** per message card.
8. **★ Message reactions** (👍/👎) — stored on message records.
9. **★ Clickable file references** — regex-scan assistant output for paths/`file:line:col`, make clickable.
10. **★ Desktop notifications** on stream completion when window unfocused.
11. **Copy-as-markdown / copy-as-plain** on any message.
12. **Message permalinks** — `thread://<id>#msg=<id>` deep links the command palette can jump to.
13. **Message collapsing** — fold long tool outputs / thinking blocks by default.
14. **Re-run from message** — retry same prompt with different model/effort.
15. **Inline citation badges** — hover card with snippet when agent cites a file.

### 3. Thread Organization

16. **★ Chat tags** — auto-tag by files touched, tools used, language, git branch; manual override.
17. **★ Cumulative cost tracking** per thread and across all threads.
18. **Thread search** — full-text over messages + tags + filenames (SQLite FTS5).
19. **Thread pinning / starring** + archive vs delete distinction.
20. **Thread folders / workspaces** — group by project root or manual grouping.
21. **Thread export** — markdown, JSON, or shareable HTML single-file.
22. **Thread import** — paste a transcript and hydrate as a new thread.

### 4. Branching UX

23. **★ Visual branch indicator** at the branch point.
24. **★ Named branches** — rename "branch 2" to "with JSON output" etc.
25. **Branch tree view** — tab bar or mini-map showing all branches.
26. **Branch comparison** — side-by-side diff of two branches' outputs.
27. **Auto-branch on edit** — make edit-and-resend always branch (never destructive).

### 5. Profiles & Reusable Config

28. **★ Profiles system** — named bundle of `{model, effort, permissionMode, systemPromptAddendum, enabledTools, mcpServers, temperature?, maxTokens?}`.
29. **Role-based profile presets** — Reviewer, Scaffolder, Explorer, Debugger.
30. **Per-project default profile** — workspace config override.
31. **Profile export/import** — share via JSON.
32. **Profile diff on switch** — show what changes when switching mid-thread.

### 6. Inference Controls

33. **★ Temperature slider** per thread/profile.
34. **★ Max tokens** override per thread.
35. **★ Stop sequences** field (advanced panel).
36. **★ JSON-mode toggle / structured output schema**.
37. **Top-p / top-k** in an "advanced" collapse.
38. **Effort-vs-tokens estimator** — predicted latency + cost before send.

### 7. Tool Enable/Disable

39. **★ Per-chat tool toggle UI** — grid of available tools with checkboxes.
40. **★ Per-profile default tool set**.
41. **Tool-allow-list lint** — warn on incoherent profiles.
42. **MCP server toggle UI** — enable/disable each configured server per chat.
43. **Per-tool approval memory** — "always allow `Bash('npm test')`".

### 8. Subagent UX

44. **★ "Open subagent conversation" view** — inline full subagent transcript.
45. **Subagent status indicator** in sidebar — count of live subagents.
46. **Subagent cancellation** from the UI.
47. **Subagent cost attribution** — roll-up of child token spend into parent.

### 9. HTTP / Orchestration Traffic Inspector

48. **★ Orchestration traffic tab** — log each CLI invocation, stdin, stdout chunks, timing, exit code.
49. **Hook event log** — timeline of named-pipe events.
50. **IPC trace viewer** — main↔preload↔renderer flows.
51. **Replay a recorded session** from the inspector.
52. **Export trace** as HAR-like JSON for bug reports.

### 10. Multi-Provider Optionality

53. **Provider abstraction layer** even if only Claude is wired.
54. **Codex-as-chat-provider** — wire an orchestration adapter.
55. **Gemini CLI adapter**.
56. **"Compare providers" mode** — same prompt, two providers, side-by-side.

### 11. Ecosystem / Moat Moves

57. **System-prompt transparency page** — surface resolved CLI prompt inside the IDE.
58. **Prompt diff on CLI version change** — alert on upstream Claude Code prompt changes.
59. **splitrail integration** — optional export of usage.
60. **Theme/prompt marketplace** — curated JSON bundles installable from command palette.
61. **"Awesome Ouroboros" reference page** — curated hooks, slash commands, MCP configs.

### 12. Theming & Customization

62. **★ VS Code theme import** — parse VS Code `.json` theme into our token set.
63. **★ Accent color picker** decoupled from full theme swap.
64. **Thinking-verb / spinner customization** (tweakcc parity).
65. **Font family per pane** (editor vs chat vs terminal).

### 13. Context & File Mentions

66. **Pinned context items** — persist across turns.
67. **Symbol-level mentions** via codebase graph — `@symbol:functionName`.
68. **Blast-radius auto-include** — offer to include callers when @-mentioning a function.
69. **Workspace "read list"** — always-in-context files per thread.

### 14. Agent Monitoring & Hooks

70. **Hook event replay** for debugging.
71. **Hook-authoring UI** — wizard that writes `.claude/settings.json`.
72. **Rule-authoring UI** — writes `.claude/rules/*.md` with live glob-match preview.

### 15. Diff Review & Change Summary

73. **Per-hunk accept/reject** within a file (currently file-level).
74. **Diff review keyboard shortcuts** — `a`/`r`/`n`/`p` Vim-style.
75. **Post-acceptance rollback** — one-click revert last accepted agent edit batch.
76. **Change summary export** as a PR description draft.

### 16. Terminal

77. **Terminal session tagging** — attach a terminal to a chat thread; output appears in transcript.
78. **Command approval UI** at the terminal layer for Claude-spawned processes.

### 17. Codebase Graph

79. **Graph panel** — interactive visual explorer.
80. **"Why this suggestion" panel** — show graph neighborhood an edit touches.

### 18. Accessibility, i18n, Platform

81. **Keyboard-only navigation audit** of `AgentChatWorkspace`.
82. **Screen-reader labels** on streaming tool cards.
83. **Multilingual UI**.
84. **Linux-first testing pass**.

### 19. Onboarding & Discovery

85. **First-run walkthrough**.
86. **Empty-state prompts** in chat.
87. **Command palette discoverability** — searchable by description.

### 20. Quality-of-life Infrastructure

88. **Auto-update channel** (stable/beta).
89. **In-app changelog / "what's new"** drawer on version bump.
90. **Crash-report opt-in** with redaction.

---

## Part 2 — Wave Strategy

Three principles drive the ordering:

1. **Front-load momentum** — ship visible polish before heavy infra.
2. **Group by shared infrastructure** — items that touch the same schema/component land together.
3. **Anchor each wave to one strategic piece** — even if the wave slips, the headline feature shipped.

### Proposed Waves

| # | Theme | Anchor | Items | Est. |
|---|---|---|---|---|
| **1** | Message polish | Desktop notifications + clickable file refs | 6, 7, 9, 10, 11, 12, 13, 14 | 3–5d |
| **2** | Chat-only view | Option B full-width view | 1, 2, 4, 5, 81, 82 | 3–4d |
| **3** | Thread org infra | Tags + search | 16, 18, 19, 20, 21, 22 | 4–6d |
| **4** | Branching polish | Named branches + branch tree | 23, 24, 25, 26, 27 | 2–3d |
| **5** | Agentic core | Profiles system | 28–32, 33–37, 39–42 | 1–2w |
| **6** | Subagent UX | Open subagent chat | 15, 44, 45, 46, 47 | 3–5d |
| **7** | Observability | Orchestration traffic inspector | 48, 49, 50, 51, 52, 70, 71, 72 | 1w |
| **8** | Cost & context | Cumulative cost + pinned context | 17, 59, 66, 67, 68, 69 | 4–6d |
| **9** | Diff/change/graph | Graph panel | 73, 74, 75, 76, 77, 78, 79, 80 | 1–2w |
| **10** | Theme & customization | VS Code theme import | 62, 63, 64, 65 | 3–4d |
| **11** | Multi-provider | Codex-as-chat-provider | 53, 54, 55, 56 | 1–2w |
| **12** | Ecosystem moat | System-prompt transparency | 57, 58, 60, 61 | 4–6d |
| **13** | Platform & onboarding | First-run walkthrough | 83, 84, 85, 86, 87, 88, 89, 90 | 1w |

### Why This Order

- **1 → 2**: Polish first proves "we sweat details" before the architectural swing of the chat-only view. If Wave 2 slips, Wave 1 still shipped.
- **3 before 5**: Thread tags/search share `threads` table migrations with profile metadata. Doing thread-schema work twice is the main avoidable cost.
- **5 is the danger wave** — profiles, inference controls, and tool toggles are independently shippable but each alone feels half-finished. Bundle them.
- **7 after 5**: Traffic inspector is more valuable once profiles exist (debug which profile caused which API shape).
- **11 deferred**: Multi-provider is intentional-Claude-first. Land it after the IDE side is saturated.

### Operating Rhythm

- **One wave = one branch = one release bump** (matches the `v1.3.x` cadence — Wave 5 of the modernization track was the last ship).
- **Each wave starts with `/specplan-draft`** on the anchor item, items numbered from this doc, acceptance criteria per item.
- **Each wave ends with a review pass** via `/review` + `/blast-radius` before merge.
- **Defer any item that grows past 2× its estimate** to a later wave rather than stretching the current one.

### Open Decisions

1. **Feature-flag every wave or not?** Flags let you merge incomplete waves but add cleanup debt (`streamingInlineEdit` flag still lingering). Recommend flagging Waves 2, 5, 7, 9, 11 only — the ones with real UX risk.
2. **Mirror progress into `ai/deferred.md`** so tracking survives chat context resets.
