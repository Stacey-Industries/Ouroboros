---
status: DRAFT
created: 2026-05-11
updated: 2026-05-11
purpose: Heavy research pass surveying how production IDE-with-agent-AI products architect their chat state, streaming, and lifecycle. One of four inputs into the Stage-1 Discovery brainstorm for the Ouroboros chat-state overhaul (`roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md`).
---

# Research: Industry Patterns for IDE Chat State, Streaming, and Lifecycle

## Scope and method

This document surveys eight products that ship agentic chat inside (or alongside) an IDE: Cursor, Windsurf (Cascade), Continue.dev, Zed, VS Code Copilot Chat, JetBrains AI Assistant, Sourcegraph Cody, and Aider. Each is analyzed against eight axes:

1. State authority — where the canonical conversation lives.
2. Streaming model — transport and chunk granularity.
3. Session lifecycle — start, end, persistence, teardown.
4. Identity model — session, message, and tool-call IDs.
5. Tool-call rendering — in-flight, completed, errored.
6. Persistence — on-disk format and location.
7. Multi-window / multi-tab — isolation vs sharing.
8. Error recovery — interrupted streams, dropped processes, crashes.

Coverage is uneven because the products differ in openness: Continue.dev, Zed, Cody (snapshot), and Aider are open source; VS Code Copilot Chat is open through its extension repo (`microsoft/vscode-copilot-chat`); Cursor, Windsurf, and JetBrains are closed and rely on public engineering posts, leaked system prompts, and devtools spelunking. Where a detail is not documented or visible in source, the entry says so explicitly.

Citations follow each claim. The cross-cutting comparison and the "patterns that don't port to a CLI-subprocess architecture" sections close the document — these are the actionable parts for Ouroboros.

---

## 1. Cursor

Cursor is an Electron fork of VS Code with chat (Ask), agent (Composer/Agent), and inline Cmd+K modes. Chat state is **client-authoritative**, persisted locally in VS Code's `state.vscdb` SQLite.

1. **State authority.** Local. Conversation content is written to per-workspace SQLite (`workspaceStorage/<hash>/state.vscdb`); Cursor's servers handle inference and indexing but do not store chat transcripts. ([dasarpai](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/), [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/cursor))
2. **Streaming model.** Request goes Client → Cursor backend → LLM provider → streamed deltas back. The backend proxies (auth, logging, prompt assembly, optional retrieval) but does not buffer the response; tokens stream to the client and get committed to SQLite once the turn completes. Granularity is token-level for prose and "semantic diff" structured edits for file changes, with a second cheaper apply-model rewriting full file contents from the diff. ([sshh.io](https://blog.sshh.io/p/how-cursor-ai-ide-works), [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/cursor))
3. **Session lifecycle.** A "composer" or chat session starts when the user opens one and persists in workspaceStorage indefinitely. Sidebar/UI metadata is split between globalStorage (app-level lists) and workspaceStorage (workspace-scoped content). The sidebar history list is global; the conversation bodies are per-workspace. ([dasarpai](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/))
4. **Identity model.** Not documented publicly. The SQLite key schema uses opaque keys such as `composer.composerData` and (legacy) `workbench.panel.aichat.view.aichat.chatdata`; inside those keys are JSON blobs with `tabs[]` / `bubbles[]` arrays for the legacy chat format. Composer's internal IDs are not visible without inspecting the JSON in a live install. ([dasarpai](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/))
5. **Tool-call rendering.** Streamed inline; edits surface as proposed diffs the user can accept/reject. The two-model speculative apply means the diff arrives semantically (with comments showing insertion sites) and is rewritten into final file contents by a second model before being shown. ([sshh.io](https://blog.sshh.io/p/how-cursor-ai-ide-works))
6. **Persistence.** SQLite key-value (`ItemTable(key TEXT PRIMARY KEY, value TEXT)`) per workspace. Chat under `composer.composerData`; cross-workspace metadata under `workbench.backgroundComposer.persistentData`. No encryption at rest beyond OS file permissions. ([dasarpai](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/))
7. **Multi-window / multi-tab.** Each VS Code window owns its workspace; the workspaceStorage hash is the natural per-window key. Multiple composer tabs within one workspace share the workspace SQLite. Cross-workspace sharing of conversations is not supported.
8. **Error recovery.** Not publicly documented. The two-model apply pattern includes lint feedback to the agent so it can self-correct broken edits, which functions as in-band error recovery for tool calls. Stream interruption handling is not in the public record. ([sshh.io](https://blog.sshh.io/p/how-cursor-ai-ide-works))

---

## 2. Windsurf — Cascade

Cascade is Windsurf's agent loop. The architecture is described as an "AI Flow" with explicit planning and tool-call gating. Closed source; public detail comes from Windsurf docs, third-party reviews, and a leaked system-prompt collection.

1. **State authority.** Client-side for conversation, with server-side memory storage. Conversation lives in the IDE; Memories (cross-session persistent preferences) are stored in the workspace and referenced automatically in later sessions. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade), [DeepWiki leaked prompts](https://deepwiki.com/jujumilk3/leaked-system-prompts/2.2-codeium-cascade-and-windsurf-ide))
2. **Streaming model.** Stream comes back from Codeium's backend; the agent loop is asynchronous and step-based, with the IDE rendering each step's tool call and result as they complete. "Sometimes you will not yet see that steps are still running" — the UI doesn't block, and additional user messages can be queued mid-turn. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade))
3. **Session lifecycle.** A Cascade session corresponds to a conversation in the panel. Sessions can be parallel ("Start work in a new Cascade while another one is executing"). The IDE tracks "Flow State" — edits, commands, terminal history, clipboard — as ambient context for the active session. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade))
4. **Identity model.** Not publicly documented. Step-level checkpoints are addressable for reversion, implying each tool call or edit has a stable identifier. The agent maintains a Todo list inside the conversation, which is itself referenceable state. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade))
5. **Tool-call rendering.** Each tool call renders as a step in the conversation with a permission gate for unsafe operations. Cap of ~20 tool calls per prompt; on hitting the cap, the user clicks "continue" to resume without context loss. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade))
6. **Persistence.** Not publicly documented at file-format level. Memories persist across sessions and are workspace-scoped. Checkpoints persist file-system state, not infrastructure state — the reversion boundary is the IDE's tracked files. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/cascade))
7. **Multi-window / multi-tab.** Multiple Cascades can run in parallel; message queuing is per-Cascade. Isolation model is per-Cascade conversation; shared model is the Memories store, scoped per workspace.
8. **Error recovery.** Resumable Flows are the explicit story: a stopped Cascade can be resumed via "continue," preserving plan and accumulated context. No public documentation on stream-drop or crash recovery.

---

## 3. Continue.dev

Continue is an open-source IDE plugin for VS Code, JetBrains, and (separately) a CLI. Its source is the most legible of the field for this research. Architecture splits into Core (IDE-agnostic Node binary), GUI (React + Redux webview), and per-IDE bindings.

1. **State authority.** Split — the GUI (renderer/webview) owns active in-memory chat state in a Redux store; Core persists sessions to disk and answers history queries. The GUI is the streaming consumer; Core is the durable record. ([DeepWiki Core](https://deepwiki.com/continuedev/continue/3-core-components), [DeepWiki History](https://deepwiki.com/continuedev/continue/8.7-history-and-session-persistence))
2. **Streaming model.** Core ↔ GUI messages flow over a `ToCoreProtocol` / `FromCoreProtocol` message-passing channel; the GUI processes streamed chunks via a `streamUpdate` Redux action that mutates the in-progress assistant message in place. Granularity is event-level (deltas, tool-call events) rather than raw token stream. ([DeepWiki Core](https://deepwiki.com/continuedev/continue/3-core-components), [sessionSlice.ts](https://github.com/continuedev/continue/blob/main/gui/src/redux/slices/sessionSlice.ts))
3. **Session lifecycle.** A session starts when the user begins typing (default title "New Session"); a `saveCurrentSession` thunk auto-titles via `ChatDescriber.describe` once enough content exists. On reopen, `loadLastSession` restores the last session, with a 1-second retry if initial load fails. Multiple sessions navigable via the History UI. ([DeepWiki History](https://deepwiki.com/continuedev/continue/8.7-history-and-session-persistence))
4. **Identity model.** Three IDs: `sessionId` (UUID, persisted), per-message `id` on `ChatHistoryItemWithMessageId`, and `lastSessionId` (the in-Redux pointer to the active session). Tool calls live inside the message structure; tool state transitions (`setToolCallCalling`, `setToolGenerated`, `updateToolCallOutput`, `cancelToolCall`, `errorToolCall`, `acceptToolCall`) are dispatched against the message-and-tool-call coordinate. ([sessionSlice.ts](https://github.com/continuedev/continue/blob/main/gui/src/redux/slices/sessionSlice.ts))
5. **Tool-call rendering.** Explicit Redux state machine. A tool call moves through calling → generated → output (or canceled/errored/accepted). The reducer surface for this is six actions, suggesting Continue learned the hard way that ad-hoc rendering paths leak. ([sessionSlice.ts](https://github.com/continuedev/continue/blob/main/gui/src/redux/slices/sessionSlice.ts))
6. **Persistence.** `~/.continue/sessions/` with one `<uuid>.json` per session plus a `sessions.json` metadata index. Session shape: `sessionId`, `title`, `workspaceDirectory`, `history: ChatHistoryItem[]`, `mode`, `chatModelTitle`, `usage`. Metadata: `sessionId`, `title`, `dateCreated`, `workspaceDirectory`, `messageCount`, `isRemote`. ([paths.ts](https://github.com/continuedev/continue/blob/main/core/util/paths.ts), [DeepWiki History](https://deepwiki.com/continuedev/continue/8.7-history-and-session-persistence))
7. **Multi-window / multi-tab.** Continue is one-chat-per-IDE-instance in the panel sense, but the History UI lets the user switch between persisted sessions. Workspace directory is a session field, so cross-workspace search works against the metadata index using MiniSearch (client-side fuzzy). Multiple IDE windows each load their own last session.
8. **Error recovery.** `streamAborter: AbortController` lives in the slice — a stream can be canceled cleanly. `isStreaming` is a top-level flag so the UI knows when to render the in-flight state. `inlineErrorMessage` is a typed error slot. `truncateHistoryToMessage` is the explicit "rewind the conversation" reducer. Crash recovery is implicit: the session file on disk is the durable record, and `loadLastSession` is the cold-boot restore.

---

## 4. Zed

Zed is a Rust-native editor (open source); its Agent Panel is the closest analog to Ouroboros in that it explicitly supports both a native agent and external agents over stdio (the Agent Client Protocol, ACP).

1. **State authority.** The `Thread` GPUI entity in `crates/agent/src/thread.rs` is the authoritative live state for a conversation. `ThreadsDatabase` (SQLite) is the durable record. `ThreadStore` is the in-memory metadata index for the sidebar. ([DeepWiki Zed agent panel](https://deepwiki.com/zed-industries/zed/8.1-agent-panel-and-ui), [DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
2. **Streaming model.** `Thread` emits `ThreadEvent` values: `AgentText` (text tokens), `AgentThinking` (thinking tokens), `ToolCall` (call begins), `ToolCallUpdate` (status change), `ToolCallAuthorization` (permission gate via oneshot channel). For external agents, `NativeAgentConnection` translates these to ACP protocol events over stdio. Granularity is event-level with per-token text deltas inside. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
3. **Session lifecycle.** `NativeAgent::new_session` creates a Thread, registers it as a session, attaches default tools, subscribes for title/token updates. `open_thread` reconstructs a Thread via `Thread::from_db` and calls `thread.replay(cx)` to re-emit all stored events into the AcpThread — replay-from-log is the resume primitive. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
4. **Identity model.** Multi-tier. `SessionId` keys the `NativeAgent.sessions: HashMap<SessionId, Session>`. `parent_session_id` tracks subagent parentage (filtered out of the UI list). Messages are positional within the `Thread.messages` vector; tool calls live alongside the requesting message. `MAX_SUBAGENT_DEPTH = 1` caps the hierarchy. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
5. **Tool-call rendering.** Permission-gated via `ToolPermissionContext` and `ThreadEvent::ToolCallAuthorization` (oneshot channel — execution blocks on user decision). Permissions persist as `AllowAlways` / `RejectAlways` patterns. The terminal tool has a special restriction: "always allow" is gated to POSIX-supporting shells to prevent bypass via command chaining. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
6. **Persistence.** SQLite at the GPUI-global level. The `DbThread` row holds `messages`, `cumulative_token_usage`, per-prompt `request_token_usage`, `subagent_context`, `thinking_enabled`, `thinking_effort`. Body is serialized as JSON then Zstd-compressed before storage. Forward-compat handled by `DbThread::from_json` version-tag detection. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))
7. **Multi-window / multi-tab.** `ThreadStore` and `ThreadsDatabase` are GPUI globals — shared across the process. Multiple windows share the same thread store; isolation is per-Thread, not per-window. The sidebar shows all root threads (subagents filtered).
8. **Error recovery.** Retries with `RetryStrategy::ExponentialBackoff` or `RetryStrategy::Fixed`; `MAX_RETRY_ATTEMPTS: u8 = 4`, `BASE_RETRY_DELAY: Duration = 5s`. Cache hints (`cache: true` on the most recent user message or last tool result) keep cost down across retries. Thread replay handles app-restart recovery. ([DeepWiki native agent](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management))

---

## 5. VS Code Copilot Chat — agent mode

VS Code's `microsoft/vscode-copilot-chat` extension is the most architecturally relevant comparison for Ouroboros because it now runs the `@github/copilot` CLI SDK locally as a subprocess, much like Ouroboros runs the `claude` CLI.

1. **State authority.** Split — the SDK's `internal.LocalSessionManager` owns canonical session state; the extension's `CopilotCLISession` wraps it and forwards events to VS Code's chat UI. Sessions persist on disk under the SDK's control. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
2. **Streaming model.** SDK event handlers translate session events to `ChatResponseStream` markdown chunks. Events include: `assistant.message_delta` (streams content via `ChatResponseStream.markdown()`), `tool.execution_start` (begins tool-progress UI), `tool.execution_complete` (finalizes tool output), `permission.requested` (blocks pending auth), `session.title_changed` (updates metadata). Granularity is event-level with per-delta text inside. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
3. **Session lifecycle.** Sessions identified by `copilotcli:///` URIs. `SessionIdForCLI` namespace handles URI ↔ ID conversion. Automatic shutdown after 300 seconds of inactivity (with cancellation if the session reactivates). Terminal handoff via `resumeCopilotCLISessionInTerminal()` which passes `--resume <sessionId>` to the CLI binary — sessions are designed to travel between the GUI chat and a terminal. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
4. **Identity model.** Session ID is opaque (URI scheme `copilotcli`). Message identity not explicitly documented but inferred from the SDK event stream (deltas attach to the current assistant turn). Tool calls carry their own identifiers via `tool.execution_start` / `tool.execution_complete` pairing. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
5. **Tool-call rendering.** Three-state: start → progress (extension-tracked) → complete (finalizes the output region). Permissions surface via `permission.requested` events delegated to an attached handler with support for awaiting user decisions. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
6. **Persistence.** SDK-managed (`internal.LocalSessionManager`) — file format not documented in the extension repo because the SDK owns it. The extension treats the SDK as the source of truth for resumption. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
7. **Multi-window / multi-tab.** `CopilotCLISessionService` maintains a `DisposableMap<string, RefCountedSession>` with reference counting so multiple providers (chat panel, sessions view) can attach to the same session safely. Per-session mutex prevents race conditions when multiple `getSession()` calls target the same ID. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions))
8. **Error recovery.** Lazy SDK initialization (`Lazy<Promise<internal.LocalSessionManager>>`) — startup failures don't crash the extension. Per-session mutex + ref-counting prevents double-spawn races. Inactivity timer with reactivation cancellation prevents stale-session resource leaks. Checkpoint feature (`chat.checkpoints.enabled`) snapshots workspace files at key chat interaction points for rollback. Background summarization (`BackgroundSummarizer`) triggers at `contextRatio >= 0.75` to compact history before exhaustion. ([DeepWiki CLI sessions](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions), [VS Code docs](https://code.visualstudio.com/docs/copilot/chat/copilot-chat))

---

## 6. JetBrains AI Assistant

Closed source; documentation is public on the JetBrains help site.

1. **State authority.** Local — chat history is stored separately per project across IDE sessions, accessible in a Chat History list. ([JetBrains AI Chat](https://www.jetbrains.com/help/ai-assistant/ai-chat.html))
2. **Streaming model.** Not documented at protocol level. The user-facing pipeline is: trigger feature → AI Assistant gathers context → request + context sent to the model → response streams back to the IDE. ([JetBrains AI Assistant overview](https://www.jetbrains.com/help/ai-assistant/about-ai-assistant.html))
3. **Session lifecycle.** Chat tool window opens; user starts conversation. New chat via "New Chat" button or Alt+Insert. Titles auto-generate from the initial query summary. Per-project chat list persists across IDE restarts. Two interaction modes: Chat (responses surface inline; user applies manually) and Agent (multi-step actions across files with review/rollback). ([JetBrains AI Chat](https://www.jetbrains.com/help/ai-assistant/ai-chat.html))
4. **Identity model.** Not documented publicly.
5. **Tool-call rendering.** Agent mode executes multi-step actions; the user reviews and accepts or discards. Granularity of the in-flight render is not documented. ([JetBrains AI Chat](https://www.jetbrains.com/help/ai-assistant/chat-mode.html))
6. **Persistence.** Per-project — chat history stored separately for each project. Format and location not documented. Request logs go to `ai-assistant-requests.md` per IDE session for review. ([JetBrains AI Chat](https://www.jetbrains.com/help/ai-assistant/ai-chat.html))
7. **Multi-window / multi-tab.** Each project has its own chat history; IDE windows are project-bound, so isolation is project-shaped.
8. **Error recovery.** Not documented publicly. Agent mode supports keep/rollback after review, which is the user-facing recovery primitive.

---

## 7. Sourcegraph Cody

Open source (snapshot before private migration); architecture is a JSON-RPC agent process talking to multiple IDE clients (VS Code, JetBrains, Emacs, Neovim).

1. **State authority.** Both. The Cody agent process is stateful; the client (IDE plugin) is also stateful. JSON-RPC notifications synchronize the two. "By the nature of using JSON-RPC via stdin/stdout, both the agent server and client run on the same computer and there can only be one client per server. It's normal for both the client and server to be stateful processes." ([cody-public-snapshot](https://github.com/sourcegraph/cody-public-snapshot), [npm @sourcegraph/cody-agent](https://www.npmjs.com/package/@sourcegraph/cody-agent))
2. **Streaming model.** JSON-RPC over stdio. Requests like `chat/submitMessage` await completion; streaming chunks arrive as `webview/postMessage` notifications keyed by chat session ID. ([protocol-alias.ts → agent-protocol.ts](https://github.com/sourcegraph/cody-public-snapshot/blob/main/agent/src/protocol-alias.ts))
3. **Session lifecycle.** `chat/new` returns a chat UUID. Variants `chat/web/new` and `chat/sidebar/new` for different host integrations. `chat/delete` for teardown. `chat/export` / `chat/import` for transcript portability. `extensionConfiguration/didChange` is the explicit "subsequent requests use the new config" notification — config is itself stateful. ([protocol-alias.ts](https://github.com/sourcegraph/cody-public-snapshot/blob/main/agent/src/protocol-alias.ts))
4. **Identity model.** Chat UUID returned from `chat/new`. Webview panel IDs separate from chat IDs (`chat/web/new` returns both). Message identity is internal to the chat — `chat/editMessage` exists, implying messages are addressable. ([protocol-alias.ts](https://github.com/sourcegraph/cody-public-snapshot/blob/main/agent/src/protocol-alias.ts))
5. **Tool-call rendering.** Agent Mode (the newer agentic layer) supports Code Search, Codebase Files, Terminal commands (with permission), Web Browser. Tool-call render protocol is internal to the webview message format and not documented at the JSON-RPC layer. ([mgx.dev analysis](https://mgx.dev/insights/sourcegraph-cody-an-in-depth-analysis-of-its-functionality-architecture-use-cases-and-competitive-landscape/a1c220a9fb544c84bc6a6c531e8cf8cd))
6. **Persistence.** Not documented in the public snapshot at file-format level. Determinism for testing is achieved via HTTP record/replay mode rather than transcript persistence per se. ([cody-public-snapshot](https://github.com/sourcegraph/cody-public-snapshot))
7. **Multi-window / multi-tab.** Multiple chats per agent process via `chat/new`. Each chat has a stable UUID. Webview panel separation supports multiple visible chats. The "one client per server" constraint means one IDE instance per agent process — not multi-IDE-window.
8. **Error recovery.** Not documented. `extensionConfiguration/didChange` allows reconfiguration without a process restart. Telemetry transcript collection has strict opt-in via the `privateMetadata` argument. ([cody ARCHITECTURE.md](https://github.com/sourcegraph/cody/blob/main/ARCHITECTURE.md))

---

## 8. Aider

Terminal-native, open source. Architecturally illuminating because it has the **simplest** chat-state model and demonstrates the costs and benefits of that simplicity.

1. **State authority.** The `Coder` Python object owns chat state in-memory; git is the durable record of code changes; `~/.aider.chat.history.md` is the durable record of conversation. ([Aider docs](https://aider.chat/docs/usage/commands.html))
2. **Streaming model.** Direct LLM SDK calls; tokens accumulate into `self.partial_response_content` and `self.multi_response_content` and render incrementally via `self.stream` / `yield_stream`. No intermediate transport. ([base_coder.py](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py))
3. **Session lifecycle.** A session is one Aider process run. The whole chat history is in context by default; `/clear` is the only way to forget. Cross-session reuse is a long-standing community request (issue #166) — not natively supported. ([base_coder.py](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py), [issue #166](https://github.com/paul-gauthier/aider/issues/166))
4. **Identity model.** Minimal. Messages are dicts `{role, content}`; lists `cur_messages` (current) and `done_messages` (summarized/historical). No message IDs. ([base_coder.py](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py))
5. **Tool-call rendering.** Aider doesn't have tool calls in the modern sense — it has edit formats (whole-file, diff, search/replace) the LLM produces in its response text, which Aider parses and applies. Errors surface as diff-apply failures and feed back into the conversation as user-visible messages.
6. **Persistence.** Markdown file (`~/.aider.chat.history.md`) parsed by `split_chat_history_markdown()`. Git commits are the durable record of code state. Configuration via `.aider.conf.yml`. ([Aider FAQ](https://aider.chat/docs/faq.html))
7. **Multi-window / multi-tab.** One Aider process per terminal — natural isolation. The history file is a shared log across all sessions on the same machine.
8. **Error recovery.** `ChatSummary` summarizes `done_messages` when context overflows; `summarize_start()` runs in the background. Multi-line mode persists through Ctrl-C at confirmation prompts (bugfix in release history). Crash recovery is implicit via git + history file. ([Aider release history](https://aider.chat/HISTORY.html))

---

## Cross-cutting comparison

| Axis | Cursor | Windsurf | Continue | Zed | VS Code Copilot | JetBrains | Cody | Aider |
|------|--------|----------|----------|-----|-----------------|-----------|------|-------|
| **State authority** | Client (SQLite) | Client + workspace memories | Split: GUI Redux + Core disk | Thread entity + SQLite | SDK-owned + extension wrapper | Per-project local | Agent + client (both stateful) | In-memory Python + markdown |
| **Transport** | HTTPS to backend, deltas back | HTTPS to backend | Core ↔ GUI message passing | In-process events + ACP stdio | SDK events → ChatResponseStream | Not documented | JSON-RPC stdio | Direct SDK |
| **Stream granularity** | Token + semantic diff | Step-level | Event-level (chunks) | Event-level (per-token deltas inside) | Event-level (`message_delta`) | Not documented | Notification-keyed by chat ID | Token |
| **Session ID** | Opaque composer ID | Not documented | UUID (`sessionId`) | `SessionId` + `parent_session_id` | URI `copilotcli:///<id>` | Not documented | UUID from `chat/new` | None (one process = one session) |
| **Message ID** | JSON-internal | Not documented | UUID per `ChatHistoryItem` | Positional in `Thread.messages` | Implicit per turn | Not documented | Internal (editable via `chat/editMessage`) | None |
| **Tool-call state machine** | Implicit (semantic-diff + apply) | Step + permission gate | 6-state Redux reducer surface | `ToolCall` / `ToolCallUpdate` / `ToolCallAuthorization` events | start / progress / complete events | Not documented | Webview-internal | Edit-format parsing |
| **On-disk format** | SQLite KV (JSON value) | Unknown | JSON-per-session + JSON metadata index | SQLite + JSON + Zstd | SDK-owned | Per-project (unknown) | Unknown (snapshot) | Markdown |
| **Persistence location** | `workspaceStorage/<hash>/state.vscdb` | Workspace memories | `~/.continue/sessions/` | SQLite (sqlez global) | SDK directory | Per project | Unknown | `~/.aider.chat.history.md` |
| **Multi-window** | Per-workspace SQLite | Multiple parallel Cascades | Per-IDE-window last-session | Process-global thread store | Ref-counted shared sessions | Project-scoped | One client per agent process | One process per terminal |
| **Stream-drop recovery** | Not documented | Resumable Flows + "continue" | `AbortController` + `truncateHistoryToMessage` | Exponential backoff (4 retries) + cache hint + replay-from-DB | Lazy init + per-session mutex + inactivity TTL | Not documented | Not documented | Implicit via git + history file |
| **Crash recovery** | SQLite-on-disk | Workspace state | `loadLastSession` thunk with retry | `Thread::from_db` + `thread.replay(cx)` | SDK-managed | Not documented | Not documented | Markdown file + git |

### Patterns that recur across products

1. **Sessions get UUIDs; messages get IDs nested inside.** Continue, Zed, Cody, and Copilot all give a session a stable UUID/URI. Messages are addressable inside the session — by UUID (Continue), positional index (Zed), or implicit turn (Copilot). The pure Aider model (no IDs) only works because Aider doesn't need to address individual messages.
2. **Tool calls are a typed state machine, not free-form events.** Continue's six reducers (`setToolCallCalling`, `setToolGenerated`, `updateToolCallOutput`, `cancelToolCall`, `errorToolCall`, `acceptToolCall`), Zed's `ToolCall` / `ToolCallUpdate` / `ToolCallAuthorization` events, and Copilot's `tool.execution_start` / `tool.execution_complete` all encode tool lifecycle as discrete states. Ad-hoc tool-call rendering is the kind of thing every mature product converges away from.
3. **Single durable record per session, plus a metadata index for the sidebar.** Continue's `<uuid>.json` body + `sessions.json` index, Zed's `DbThread` body + `ThreadMetadataStore`, Cursor's per-workspace SQLite + global metadata — all separate "list me the sessions" from "load this session's contents." Lazy body load is the universal pattern.
4. **Replay-from-log is the resume primitive.** Zed's `thread.replay(cx)` after `Thread::from_db`, Copilot's SDK-driven resume via `--resume <id>`, Continue's `loadLastSession` thunk all reconstruct UI state by re-emitting stored events into a fresh consumer. This is the same pattern as event-sourced systems: persist events, replay to rebuild state.
5. **Background summarization triggers at a token-budget ratio.** Copilot at `contextRatio >= 0.75`, Aider's `ChatSummary` on overflow, Cody's split 30k/15k context pools — context-window pressure is a first-class concern with an explicit eviction policy, not an afterthought.
6. **Stream-cancel is `AbortController`-shaped.** Continue's `streamAborter: AbortController` lives directly in the slice. Most products surface cancellation as a single user-facing button backed by a single owner of the cancel signal.
7. **Permission gates are blocking events with oneshot channels.** Zed's `ToolCallAuthorization` oneshot, Copilot's `permission.requested` awaiting user decision — the agent loop pauses on a yieldable awaitable rather than polling or callback hell.
8. **Ref-counted session handles when multiple UI views share a session.** Copilot's `RefCountedDisposable` / `DisposableMap<string, RefCountedSession>` + per-session mutex is the most explicit example; Continue's Redux store implicitly serves the same role for the renderer-side; Zed's GPUI entity reference model handles it at the language level.

### Patterns specific to API-direct products that DO NOT port to a CLI-subprocess architecture

This is the section Ouroboros cares about most. The IDE here doesn't make HTTPS calls to Anthropic — it spawns `claude` and parses stream-json on stdout. Several otherwise-attractive patterns assume direct API control and don't survive the indirection.

1. **Server-side prompt assembly and prompt caching.** Cursor's backend assembles prompts, manages retrieval, and exploits Anthropic prompt caching for cheap context-window reuse. ([Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/cursor)) The Ouroboros architecture doesn't compose the prompt at all — the `claude` CLI does. Prompt caching happens inside `claude`'s process, opaque to the IDE. Adopting the Cursor pattern would require either (a) replacing the CLI with a direct SDK call (the constraint says no — subscription auth, no API key), or (b) wrapping the CLI with a prompt-rewriting proxy (large surface area, fragile).
2. **Direct token-delta streaming control.** Continue dispatches `streamUpdate` actions keyed to token deltas; Zed emits `AgentText` for each token. Ouroboros receives stream-json events from `claude`'s stdout — event-level granularity, not token-level. The renderer never sees raw tokens. Patterns assuming token-level mutation of the in-flight message must instead operate at the event level.
3. **Cancel = `AbortController.abort()`.** Continue's `streamAborter` aborts an in-flight HTTPS fetch. Ouroboros cancel = SIGINT/SIGTERM the subprocess, then drain the pipe. Cancel semantics aren't "stop receiving" — they're "kill a process whose midstream state you don't control." The cancel primitive is heavier and slower and has its own teardown surface (pipe drain, exit-code handling, named-pipe hook cleanup).
4. **Single-channel transport.** Continue, Zed, Copilot, and Cody all have one transport channel per conversation (Core ↔ GUI message, ACP stdio, SDK events, JSON-RPC stdio). Ouroboros has **three independent channels** per `claude` subprocess: stdout stream-json, named-pipe hook events, in-process synthetic events. None of these channels have ordering guarantees with respect to each other. Patterns that assume "the next event always belongs to the most recent message" don't survive multi-channel ingestion.
5. **In-process retry of failed completions.** Zed's `RetryStrategy::ExponentialBackoff` with 4 attempts assumes the agent owns the HTTP call. The Ouroboros IDE doesn't own the call — `claude` does. Retries happen inside the CLI and surface to the IDE only as stream events or exit codes. The IDE-side equivalent would be "respawn the CLI with `--resume`," which is structurally different (full process recreation, not a retry of an in-flight call).
6. **SDK-managed session resumption via flag.** Copilot's `--resume <sessionId>` flag is supported because the `@github/copilot` SDK ships first-party session management. The `claude` CLI also supports `--resume`, but the IDE has to (a) own the mapping between IDE-side conversation IDs and Claude session IDs, (b) trust the CLI to recover correctly, and (c) reconcile any IDE-side state that doesn't survive the gap. Cody's "two stateful processes" framing applies — Ouroboros must explicitly own the stateful-on-both-sides reality.
7. **Single session-ID namespace.** Most products operate with one ID per conversation (the SDK's, the agent's, or the IDE's). Ouroboros has at least three coexisting namespaces in its current architecture: `$CLAUDE_SESSION_ID` (env), stream-json `session_id`, and the agent hook `session_id`. The codebase's `multi-process-debugging.md` rule explicitly calls these out as three different values. This is **not** an industry-standard problem — it's a Ouroboros-specific failure mode introduced by running the CLI as a subprocess and listening on multiple channels. The other products don't face it because they don't have the multi-channel ingestion.
8. **Reactive UI consumes a single event stream.** Continue's Redux slice has `streamUpdate` as the single mutation entry point; Zed's `ThreadEvent` is the single emitter. Ouroboros has stream events arriving from stdout while hook events arrive on a named pipe — the renderer can't have a single mutation entry point without an upstream merge step. The pattern that ports is "merge the multi-channel ingest into a single ordered event log in main, then ship that log to the renderer as the one stream." That's an architectural move the open-source products don't have to make.

### Patterns that DO port cleanly

These are the ones the Ouroboros overhaul should consider first.

1. **Session UUID + per-message UUID, both persisted.** Continue's model. Cheap to adopt; eliminates entire classes of "which message did this event belong to" bugs.
2. **Six-state tool-call reducer surface.** Continue's `setToolCallCalling` / `setToolGenerated` / `updateToolCallOutput` / `cancelToolCall` / `errorToolCall` / `acceptToolCall`. Maps cleanly onto stream-json tool_use / tool_result event pairs.
3. **One JSON file per session + JSON metadata index, both on disk.** Continue's `~/.continue/sessions/<uuid>.json` plus `sessions.json`. SQLite is overkill for the cardinality (tens to hundreds of conversations, not millions); flat files are easier to debug, version, back up, and inspect with off-the-shelf tools.
4. **Replay-from-log as the resume primitive.** Zed's `Thread::from_db` + `thread.replay(cx)`. The Ouroboros equivalent: persist the merged event log per conversation; on reopen, replay events through the same renderer pipeline that the live stream uses. Live and resumed code paths converge.
5. **Background summarization at a token-budget ratio.** Copilot's `BackgroundSummarizer` at `contextRatio >= 0.75`. Ouroboros has to either run summarization on the IDE side (since `claude` is opaque) or rely on `claude`'s own compaction — but the pattern of "compact at a threshold, not on overflow" is portable.
6. **Permission gates as blocking awaitables.** Zed's oneshot channel approach. The named-pipe hook events that Ouroboros already uses for hook prompts already fit this shape — the renderer just needs to await a single resolution rather than poll.
7. **Single owner of the cancel signal.** Continue's `streamAborter` lives in one place. The Ouroboros equivalent owns the subprocess handle and the pipe drainer, but the principle (one cancel button, one responsible owner) is the same.
8. **Ref-counted session handles when multiple UI views attach.** Copilot's `RefCountedDisposable` model. Maps directly onto Ouroboros's multi-tab and multi-window need: one underlying subprocess can be attached by multiple chat tabs (or future shared-conversation features) without double-spawning or premature teardown.

---

## Sources

- **Cursor**:
  - [How Cursor (AI IDE) Works — sshh.io](https://blog.sshh.io/p/how-cursor-ai-ide-works)
  - [Cursor Chat: Architecture, Data Flow & Storage — dasarpai](https://dasarpai.com/dsblog/cursor-chat-architecture-data-flow-storage/)
  - [Real-world engineering challenges: building Cursor — Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/cursor)
  - [How Cursor Actually Works — Data Science Collective](https://medium.com/data-science-collective/how-cursor-actually-works-c0702d5d91a9)
- **Windsurf / Cascade**:
  - [Windsurf — Cascade docs](https://docs.windsurf.com/windsurf/cascade/cascade)
  - [Codeium Cascade and Windsurf IDE — leaked system prompts (DeepWiki)](https://deepwiki.com/jujumilk3/leaked-system-prompts/2.2-codeium-cascade-and-windsurf-ide)
- **Continue.dev**:
  - [Core System — DeepWiki](https://deepwiki.com/continuedev/continue/3-core-components)
  - [History and Session Persistence — DeepWiki](https://deepwiki.com/continuedev/continue/8.7-history-and-session-persistence)
  - [sessionSlice.ts — GitHub](https://github.com/continuedev/continue/blob/main/gui/src/redux/slices/sessionSlice.ts)
  - [paths.ts — GitHub](https://github.com/continuedev/continue/blob/main/core/util/paths.ts)
- **Zed**:
  - [Agent Panel and UI — DeepWiki](https://deepwiki.com/zed-industries/zed/8.1-agent-panel-and-ui)
  - [Native Agent and Thread Management — DeepWiki](https://deepwiki.com/zed-industries/zed/8.4-native-agent-and-thread-management)
- **VS Code Copilot Chat**:
  - [CLI Chat Sessions — DeepWiki](https://deepwiki.com/microsoft/vscode-copilot-chat/6.2-cli-chat-sessions)
  - [Chat overview — VS Code docs](https://code.visualstudio.com/docs/copilot/chat/copilot-chat)
  - [Use agent mode — VS Code docs](https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode)
- **JetBrains AI Assistant**:
  - [AI Chat — JetBrains docs](https://www.jetbrains.com/help/ai-assistant/ai-chat.html)
  - [About AI Assistant — JetBrains docs](https://www.jetbrains.com/help/ai-assistant/about-ai-assistant.html)
- **Sourcegraph Cody**:
  - [cody-public-snapshot — GitHub](https://github.com/sourcegraph/cody-public-snapshot)
  - [agent-protocol via protocol-alias.ts — GitHub](https://github.com/sourcegraph/cody-public-snapshot/blob/main/agent/src/protocol-alias.ts)
  - [@sourcegraph/cody-agent — npm](https://www.npmjs.com/package/@sourcegraph/cody-agent)
  - [cody ARCHITECTURE.md — GitHub](https://github.com/sourcegraph/cody/blob/main/ARCHITECTURE.md)
- **Aider**:
  - [base_coder.py — GitHub](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py)
  - [Aider FAQ](https://aider.chat/docs/faq.html)
  - [In-chat commands](https://aider.chat/docs/usage/commands.html)
  - [Release history](https://aider.chat/HISTORY.html)
