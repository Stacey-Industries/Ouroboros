# Multi-Process Debugging Rule (src/main/hooks.ts, src/main/agentChat/**)

This codebase has 3+ independent event channels (stream-json stdout, named pipe hooks, in-process synthetic events) with no ordering guarantees. The IDE also runs inside itself — there's always a terminal Claude Code session active.

## When debugging event flow / timing issues:

1. **Add `log.info('[trace:TAG]', key, values)` FIRST** — don't propose fixes from code reading alone
2. **Log at BOTH emission and reception** — events can be lost, reordered, or duplicated between channels
3. **Never assume two IDs are the same** — `$CLAUDE_SESSION_ID`, stream-json `session_id`, and agent hook `session_id` are 3 different values
4. **Account for the terminal session** — the current Claude Code process (the one editing code) is always running and emits its own hook events
5. **Check event ordering** — `sessionRef.sessionId` is set by the event handler, but `sink.emit()` may fire before the setter runs
