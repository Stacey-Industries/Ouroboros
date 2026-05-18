---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 wave-wrap smoke
severity: low
---

# Claude CLI color / theme rendering off in in-app terminal

Surfaced during Wave 94 wave-wrap smoke (Cole, 2026-05-18). Claude
Code's TUI (the boxed status panel, the `❯` cursor, the bullet markers)
renders with "kind of messed up" color formatting when run inside an
in-app dock-slot terminal. Same `claude` binary in an external Windows
Terminal renders correctly.

## Likely cause candidates

1. `TERM=xterm-256color` is set by `ptyEnv.ts:67` and `COLORTERM=truecolor`
   on line 68 — so basic terminfo should work. But Claude's TUI may
   probe specific terminal features (e.g., specific OSC sequences,
   terminal width detection, bg-color query) that xterm.js handles
   differently than Windows Terminal.
2. OSC 10/11/12 (background/foreground/cursor color) — the IDE blocks
   these via `term.parser.registerOscHandler` per the Terminal CLAUDE.md
   ("prevents theme color override"). Claude may rely on OSC 11 to
   detect the background and adapt its palette; with OSC 11 blocked it
   falls back to a wrong assumption.
3. Theme color mismatch — Claude's TUI uses specific ANSI color slots
   (e.g., bright cyan for prompts); IDE theme tokens may not map cleanly
   to those slots if the theme isn't a "standard" dark theme.

## Fix shape

1. **Repro narrowing.** Compare side-by-side: same `claude` command in
   external Windows Terminal vs in-app terminal with the same theme.
   Identify which specific elements look wrong (cursor color, box
   borders, status panel bg).
2. **OSC handler audit.** If Claude relies on OSC 11 for bg detection,
   the IDE's OSC blocker may be the cause — consider allowing OSC 11
   read queries (response only) without allowing OSC 11 writes (theme
   override).
3. **Theme palette check.** Inspect the active theme's xterm color
   block (`theme: { foreground, background, black, red, ... brightBlack
   ... }`) and verify all 16 ANSI slots are sane for Claude's TUI.

## Pointers

- `src/renderer/components/Terminal/TerminalSession.tsx` — xterm init,
  theme application, OSC handlers.
- `src/main/ptyEnv.ts` — env vars (TERM, COLORTERM).
- `src/renderer/themes/` — theme color definitions.

Estimate: 1–2 hours investigation + fix.
