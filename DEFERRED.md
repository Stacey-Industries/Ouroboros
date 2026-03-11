# Agent IDE — Deferred Items (v2+)

Items intentionally excluded from v1 to reduce scope. Revisit after v1 ships.

## Deferred from Original Spec

### File Editing
- **What**: In-app code editing (currently read-only viewer)
- **Why deferred**: Adds significant complexity (dirty state, save handling, conflict resolution). The agent does the editing — users just need visibility.
- **Revisit when**: Users request inline edits for quick fixes

### Git Integration
- **What**: Branch switching, commit history, diff viewer, status indicators
- **Why deferred**: Users have their own Git tooling. Adding a partial Git UI risks being worse than existing tools.
- **Revisit when**: v2 — could add git status badges to file list

### Multi-Machine / Remote Sessions
- **What**: Connecting to Claude Code running on a remote server
- **Why deferred**: Requires SSH tunneling, auth, reconnection logic. Major scope increase.
- **Revisit when**: Users need to monitor cloud-hosted agent sessions

### Auth / API Key Management
- **What**: Managing Anthropic API keys, Stripe keys, etc. from the app
- **Why deferred**: Security-sensitive. Users manage keys via CLI or env files today.
- **Revisit when**: Never (likely) — this belongs in the CLI or dashboard, not a launcher

---

## Deferred from Review (Pre-Build)

### Full Recursive File Tree
- **What**: Collapsible directory tree with lazy loading, .gitignore filtering
- **Why deferred**: Replaced with filtered file list (Ctrl+P style) for v1. Full tree is complex with large repos (10K+ files need virtualization).
- **Shipped instead**: Flat filtered file list with fuzzy search
- **Revisit when**: v2 — if users miss hierarchical browsing

### Right-Click Context Menus
- **What**: "Open in terminal", "Copy path" on file list items
- **Why deferred**: Low-value convenience feature. Users can copy paths from breadcrumbs.
- **Revisit when**: v2 polish pass

### Session History / Analytics
- **What**: Persisting session logs (project, duration, exit code) to SQLite
- **Why deferred**: Nice-to-have. Recent projects list covers the core need.
- **Revisit when**: v2 — useful for "time spent per project" insights

### Hook Payload Sanitization (DOMPurify)
- **What**: Sanitizing tool call data before rendering in agent monitor
- **Status**: Partially addressed — using React's built-in XSS protection (no dangerouslySetInnerHTML). Full DOMPurify integration deferred.
- **Revisit when**: If rendering raw HTML content from tool calls

---

## Prioritized Backlog (Post-v1)

1. Full file tree with virtualization
2. Session history + SQLite storage
3. Git status indicators on file list
4. Right-click context menus
5. Split terminal (horizontal/vertical)
6. Plugin system for custom panels
7. Remote session support
