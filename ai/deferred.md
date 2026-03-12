# Ouroboros — Deferred Features

Completed features have been stripped from this file. See git history for the full implementation log.

---

## File Viewer

- [x] **Inline editing** — Full editor capabilities (deferred by design: agent edits, user reviews)
- [x] **Multi-buffer editing** — Zed-style: compose excerpts from multiple files into one view
- [x] **Diff review mode** — After agent completes, show consolidated diff with accept/reject per-hunk

## Agent & Session

- [x] **Session replay / playback** — Scrub through past agent sessions to see what it did, when, and why
- [x] **Multi-session orchestration** — Launch parallel Claude Code sessions with side-by-side monitoring and aggregate cost/token usage
- [x] **Agent cost dashboard** — Persistent view of cost over time, per-session breakdown, daily/weekly totals
- [x] **Agent templates / quick actions** — Pre-configured launch profiles (e.g. "Review this PR", "Write tests for open file", "Explain this codebase")
- [x] **Agent completion notifications** — System notifications when long-running agent sessions complete or error
- [x] **Session bookmarks / notes** — Annotate agent sessions with user notes for future reference
- [x] **Terminal session export** — Export sessions as shareable artifacts (asciicast recording + JSON/markdown agent session export)

## Git Integration

- [x] **Git panel** — Dedicated sidebar tab for staged/unstaged changes, branch switching, and commit creation

## Infrastructure & Platform

- [x] **Language server protocol (LSP)** — Code intelligence for inline editing (completions, diagnostics, go-to-definition)
- [x] **Plugin/extension system** — WASM-sandboxed extensions (inspired by Zed's approach)
- [x] **Multi-window** — Open multiple projects in separate windows
- [x] **Workspace layouts** — Save and restore panel arrangements for different workflows (monitoring vs reviewing)

---

## Explicitly Out of Scope

These will not be implemented:
- **Authentication / API key management** — Belongs in CLI or Anthropic dashboard
- **Model selection** — Handled by Claude Code CLI, not the IDE wrapper
- **Chat interface** — This is a monitoring/observation tool, not a chat client. The terminal IS the interface
- **Web/cloud version** — Desktop only (Electron)
