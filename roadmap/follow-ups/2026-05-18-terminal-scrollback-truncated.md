---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 wave-wrap smoke
severity: medium
---

# Terminal scrollback truncated during long Claude runs

Surfaced during Wave 94 wave-wrap smoke (Cole, 2026-05-18). When running
`claude` interactively in a dock-slot terminal, the scrollback gets cut
off — user can only scroll up a small distance and the rest of the
session history is gone, mid-session (not after a project switch /
remount).

## Likely cause

xterm.js default scrollback buffer is 1000 lines. Long Claude tool-use
streams (especially MultiEdit + status panels) blow past that quickly.
Each new line beyond the cap evicts the oldest. Not Wave-94-introduced —
the default was always 1000 — but Wave 94's terminal-first shift makes
Claude in-terminal the primary surface, so the limitation now bites
where it didn't before.

## Fix shape

- Bump xterm `scrollback` option in `src/renderer/components/Terminal/`
  TerminalSession init. VS Code uses 1000 by default and exposes it as
  `terminal.integrated.scrollback`. Suggested raise: 10000–50000.
- Add `Settings → Terminal → Scrollback lines` (default 10000) so power
  users can tune further.
- Verify memory footprint at 50000 lines for a typical session
  (~50 MB per terminal at worst-case 80-col rows; acceptable for ≤4
  concurrent sessions).

## Pointers

- xterm options: `src/renderer/components/Terminal/TerminalSession.tsx`
  (look for `new Terminal({ ... })`).
- Settings schema: `src/main/configSchemaTail*.ts` for the new key.

Estimate: 1 file + setting + tests, ~1 hour.
