---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 wave-wrap smoke
severity: medium
---

# Ghost cursor in terminal (xterm WebGL/DOM overlap)

Surfaced during Wave 94 wave-wrap smoke (Cole, 2026-05-18). When running
`claude` in a dock-slot terminal:
- Ghost cursor appears in random places while Claude is "thinking".
- A ghost cursor appears in front of the typing cursor when the user
  types.

## Likely cause

Documented pre-existing pattern in `src/renderer/components/Terminal/CLAUDE.md`:

> Loading WebGL after `term.open()` causes DOM + WebGL cursor overlap —
> this is the VS Code pattern.

The CLAUDE.md says the renderer load order is critical:
> WebGL renderer active via `@xterm/addon-webgl` — must load BEFORE
> `term.open()` (not after) to avoid double cursor.

If this regressed (or the rule was violated somewhere along the way) the
double cursor returns. Wave 94 did NOT touch xterm or the WebGL load
order — but the pivot to terminal-first makes the ghost cursor more
visible/annoying than it was when terminal was a side panel.

## Fix shape

1. Audit the xterm/WebGL initialization sequence in
   `src/renderer/components/Terminal/TerminalSession.tsx` (and any
   `useEffect` that calls `term.loadAddon(new WebglAddon())`).
2. Verify `loadAddon(WebglAddon)` runs BEFORE `term.open()`. If the
   order is correct in code but still showing ghost cursors, instrument
   with `console.log('[xterm-init]', { addonLoaded, opened })` to trace
   actual order at runtime.
3. Check whether a recent xterm.js version bump changed the cursor
   rendering path (`@xterm/xterm` + `@xterm/addon-webgl` versions in
   package.json).
4. Fallback: if WebGL has known cursor issues with the current xterm
   version, consider switching to Canvas renderer or disabling WebGL
   for problematic shells (powershell on Windows is a known offender).

## Pointers

- `src/renderer/components/Terminal/CLAUDE.md` — existing doc on the
  pattern.
- `src/renderer/components/Terminal/TerminalSession.tsx` — likely init
  site.

Estimate: investigation 30min + fix 30–60min.
