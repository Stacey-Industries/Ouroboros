# Agent IDE — Deferred Features

Completed features have been stripped from this file. See git history for the full implementation log.

---

## File Viewer

- [ ] **Inline editing** — Full editor capabilities (deferred by design: agent edits, user reviews)
- [ ] **Multi-buffer editing** — Zed-style: compose excerpts from multiple files into one view

## Infrastructure & Platform

- [ ] **Plugin/extension system** — WASM-sandboxed extensions (inspired by Zed's approach)
- [ ] **Remote sessions** — Connect to agents running on remote machines via SSH tunnel
- [ ] **Multi-window** — Open multiple projects in separate windows

---

## Explicitly Out of Scope

These will not be implemented:
- **Authentication / API key management** — Belongs in CLI or Anthropic dashboard
- **Model selection** — Handled by Claude Code CLI, not the IDE wrapper
- **Chat interface** — This is a monitoring/observation tool, not a chat client. The terminal IS the interface
- **Web/cloud version** — Desktop only (Electron)
- **Language server protocol (LSP)** — Adds complexity; the agent handles code intelligence. Revisit only if inline editing is added
