# Terminal Modernization Plan

> **Goal**: Bring the terminal to Warp/VS Code-level quality within the xterm.js + Electron constraints.
> **Current state**: xterm.js 5.5.0, canvas renderer, OSC 133 command blocks, multi-tab, split panes, history search, completions, recording.
> **Target state**: Shell integration (OSC 633), WebGL rendering, sticky scroll, structured input editor, command block UI with per-block actions, inline images, progress detection.

---

## Architecture Decisions

### Rendering: Upgrade to WebGL with Canvas Fallback
The CLAUDE.md warns about ghost cursor artifacts with `@xterm/addon-webgl`. This was observed with xterm 5.x; xterm 6.0.0 (December 2025) includes WebGL fixes and synchronized output (DEC mode 2026) that eliminate tearing. **Action**: upgrade to xterm 6.x and re-enable WebGL with a runtime fallback.

### Shell Integration: OSC 633 (VS Code Protocol)
The current OSC 133 implementation is a subset. VS Code's OSC 633 extends it with:
- `633;E;commandline` — captures the actual command text
- `633;P;Cwd=path` — reports current working directory
- `633;A/B/C/D` — same prompt/command/output/completion markers as OSC 133

This unlocks: command decorations, sticky scroll, command navigation, structured history with actual command text.

### Input Editor: Hybrid Approach
Warp and JetBrains use a separate editor for the prompt. Full replacement is fragile (breaks vim, ssh, etc.). Use a **hybrid**: detect when the shell is at a prompt (via OSC 633;A), overlay a CodeMirror micro-editor on the prompt region, switch to raw PTY passthrough when a full-screen program runs (detected via alternate screen buffer).

---

## Phases

### Phase 1: Foundation Upgrade (No UI Changes)
**Parallelizable**: All tasks independent of each other.

#### 1A. Upgrade xterm.js to v6.x
- **Files**: `package.json`, all `@xterm/*` addon imports
- **Steps**:
  1. `npm install @xterm/xterm@^6.0.0 @xterm/addon-fit@latest @xterm/addon-search@latest @xterm/addon-web-links@latest`
  2. Audit breaking changes in xterm 6.0.0 changelog (ESM support, API changes)
  3. Update all imports — xterm 6 uses ESM; verify electron-vite handles this
  4. Run `npm test` and manual smoke test in terminal
- **Edge cases**:
  - electron-vite may need config for ESM xterm — check `electron.vite.config.ts` externals
  - Addon version compatibility — all `@xterm/*` packages MUST share the same major version
  - The `term.parser.registerOscHandler` calls for blocking OSC 10/11/12 may have API changes
- **Verify**: Terminal renders, text input works, search works, links clickable

#### 1B. Enable WebGL Renderer with Fallback
- **Files**: `useTerminalSetup.lifecycle.ts`, `package.json`
- **Steps**:
  1. `npm install @xterm/addon-webgl@latest`
  2. In `createBootstrapTerminal()`, after `term.open()`:
     ```ts
     try {
       const webgl = new WebglAddon()
       webgl.onContextLoss(() => { webgl.dispose(); /* fall back to canvas */ })
       term.loadAddon(webgl)
     } catch {
       // canvas fallback — no addon needed, it's the default
     }
     ```
  3. Test rapid output (run `find / -type f` or `cat` a large file) — watch for ghost cursor
  4. If artifacts persist, add a config toggle `useWebGlRenderer` defaulting to `true`
- **Edge cases**:
  - WebGL2 not available in some virtualized environments — the try/catch handles this
  - `onContextLoss` must dispose the addon and NOT re-attach (causes infinite loop)
  - Must load WebGL addon AFTER `term.open()` — before will throw

#### 1C. Install New Addons
- **Files**: `package.json`, `useTerminalSetup.lifecycle.ts`
- **Addons to add**:
  - `@xterm/addon-image` — Sixel + iTerm2 inline images
  - `@xterm/addon-clipboard` — OSC 52 clipboard access
  - `@xterm/addon-serialize` — buffer serialization (for session save/restore)
  - `@xterm/addon-unicode-graphemes` — proper emoji/CJK rendering
  - `@xterm/addon-progress` — OSC 9;4 progress bar detection
- **Steps**:
  1. Install all packages
  2. Load in `loadTerminalAddons()` after core addons
  3. For image addon: configure max dimensions (e.g., 800x600) to prevent memory abuse
  4. For progress addon: subscribe to progress events, expose via controller
  5. For unicode-graphemes: call `term.unicode.activeVersion = 'graphemes'`
- **Edge cases**:
  - Image addon + WebGL addon interaction — test inline images render in WebGL mode
  - Unicode graphemes addon is experimental — may affect cursor positioning in some edge cases
  - Progress addon requires programs to emit OSC 9;4 (npm, pip, cargo do; many others don't)

---

### Phase 2: Shell Integration (OSC 633)
**Depends on**: Phase 1A (xterm 6.x)
**Parallelizable within phase**: 2A and 2B are independent; 2C depends on both.

#### 2A. Shell Integration Scripts
- **New files**: `src/main/shellIntegration/bash.sh`, `zsh.sh`, `fish.fish`, `pwsh.ps1`
- **Purpose**: Inject shell hooks that emit OSC 633 sequences
- **Implementation**:
  1. Create integration scripts per shell (reference VS Code's `shellIntegration-*.sh`)
  2. Each script:
     - Sets `precmd` / `preexec` hooks (or `PROMPT_COMMAND` for bash)
     - Emits `\x1b]633;A\x07` at prompt start
     - Emits `\x1b]633;B\x07` when command begins
     - Emits `\x1b]633;C\x07` when execution starts
     - Emits `\x1b]633;D;$?\x07` when command completes (with exit code)
     - Emits `\x1b]633;E;${cmd}\x07` with the command text
     - Emits `\x1b]633;P;Cwd=${PWD}\x07` after each prompt
  3. Inject via PTY spawn environment: `ENV=/path/to/integration.sh` for bash, `ZDOTDIR` override for zsh
  4. Must not break user's existing `.bashrc` / `.zshrc` — source user config FIRST, then add hooks
- **Edge cases**:
  - User has `set -e` / `set -o errexit` — the hook must not cause failures
  - Nested shells — detect and skip re-injection (check for sentinel env var)
  - SSH sessions — integration scripts don't transfer; disable features gracefully
  - Fish shell uses `fish_prompt` / `fish_preexec` functions, not POSIX hooks
  - PowerShell uses `$PROMPT` function override
  - tmux/screen — OSC sequences must be wrapped in DCS passthrough (`\x1bPtmux;\x1b....\x1b\\`)

#### 2B. OSC 633 Parser Addon
- **Files**: New `src/renderer/components/Terminal/shellIntegrationAddon.ts`
- **Purpose**: Custom xterm.js addon that parses OSC 633 sequences into structured events
- **Implementation**:
  1. Create class `ShellIntegrationAddon implements ITerminalAddon`
  2. In `activate(terminal)`, register OSC handlers:
     ```ts
     terminal.parser.registerOscHandler(633, (data) => { ... })
     ```
  3. Parse the sub-command (A/B/C/D/E/P) and emit typed events:
     ```ts
     type ShellEvent =
       | { type: 'promptStart'; row: number }
       | { type: 'commandStart'; row: number }
       | { type: 'commandExecuted'; row: number }
       | { type: 'commandFinished'; row: number; exitCode: number }
       | { type: 'commandLine'; text: string }
       | { type: 'cwd'; path: string }
     ```
  4. Maintain a `CommandDetection` store:
     - Track current command boundaries (promptStart → commandStart → commandExecuted → commandFinished)
     - Store command text, exit code, output row range, CWD
     - Expose `commands: CommandRecord[]` and `currentCommand: CommandRecord | null`
  5. Expose event emitter: `onCommand(cb: (cmd: CommandRecord) => void)`
- **Edge cases**:
  - Incomplete sequences (data arrives split across chunks) — buffer partial OSC data
  - Rapid commands (semicolon-separated) — each gets its own A→D cycle
  - Background jobs — `&` commands may not trigger preexec properly
  - Clear screen (`Ctrl+L` / `clear`) — invalidates row numbers; must handle buffer reset
  - Terminal resize — row numbers shift; store buffer-relative positions, not viewport-relative

#### 2C. Replace OSC 133 with OSC 633
- **Files**: `osc133Handler.ts`, `useCommandBlocks.ts`, `useCommandBlocksController.ts`
- **Steps**:
  1. Refactor `osc133Handler.ts` to delegate to the new `ShellIntegrationAddon`
  2. Update `useCommandBlocksController.ts` to consume `CommandRecord[]` from the addon
  3. Add command text to each block (from `633;E`)
  4. Add CWD tracking to each block (from `633;P`)
  5. Remove the 3-second grace period heuristic — OSC 633 is reliable; if not detected after first prompt, fall back to heuristic mode
  6. Keep backward compatibility: if OSC 133 is detected (no 633), use legacy parser
- **Edge cases**:
  - Mixed environments: some commands emit 633, some don't (e.g., running a script that spawns a subshell)
  - Must handle both 133 and 633 simultaneously during transition

---

### Phase 3: Command Block UI (Warp-Inspired)
**Depends on**: Phase 2C
**Parallelizable within phase**: 3A, 3B, 3C are independent UI features over the same data.

#### 3A. Visual Command Separators and Gutters
- **Files**: `CommandBlockOverlay.tsx`, `CommandBlockOverlayBody.tsx`, new CSS
- **Implementation**:
  1. For each `CommandRecord`, render:
     - Horizontal separator line above the prompt row
     - Left gutter icon: green checkmark (exit 0), red X (non-zero), spinner (running)
     - Command text label in the separator (from `633;E`)
     - Timestamp (relative: "2s ago", "5m ago")
  2. Use xterm.js decoration API (`terminal.registerDecoration()`) for gutter icons — these track buffer position through scrolling/resize automatically
  3. For separator lines, use CSS `::before` pseudo-element on decorated rows
  4. Color-code output regions: subtle left border (green for success, red for failure)
- **Edge cases**:
  - Very long commands — truncate with ellipsis, full text in tooltip
  - Commands with no output — still show separator, collapse to single line
  - Scrollback buffer eviction — decorations on evicted rows must be cleaned up (xterm fires `onDispose` on the decoration)

#### 3B. Per-Block Actions
- **Files**: `CommandBlockOverlay.tsx`, new `CommandBlockActions.tsx`
- **Actions per block**:
  1. **Copy output** — serialize only the output rows (between commandExecuted and commandFinished)
  2. **Copy command** — copy the command text from `633;E`
  3. **Re-run command** — write command text + newline to PTY
  4. **Collapse/expand** — hide output rows, show "N lines" placeholder
  5. **Search within block** — scope the search addon to the block's row range
  6. **Share block** — serialize to a shareable format (asciicast segment or HTML)
  7. **Explain with AI** — send command + output to agent chat as context
- **Edge cases**:
  - Re-run when CWD has changed since original execution — warn user
  - Copy output with ANSI codes — strip by default, offer "copy with colors" option
  - Collapse of a block that's currently being written to — defer collapse until commandFinished

#### 3C. Command Navigation and Sticky Scroll
- **Files**: New `useCommandNavigation.ts`, `StickyScrollOverlay.tsx`
- **Implementation**:
  1. **Navigation**: Ctrl+Up/Down jumps to previous/next command prompt row
     - Use `terminal.scrollToLine()` to position the viewport
     - Flash/highlight the command briefly after jump
  2. **Sticky scroll**: When scrolling through a long output, pin the command that produced it at the top
     - Render a thin overlay div absolutely positioned at top of terminal container
     - Show: command text, exit code indicator, duration
     - Click to scroll back to the command's prompt row
     - Hide when viewport is at the actual command row (no duplication)
  3. Add keyboard shortcuts to `useTerminalSetup.keyboard.ts`
- **Edge cases**:
  - Sticky scroll during active output (command still running) — show spinner, live-update duration
  - Multiple commands visible in viewport — sticky scroll shows the topmost one
  - Terminal resize while sticky scroll is visible — recompute overlay position

---

### Phase 4: Structured Input Editor
**Depends on**: Phase 2 (shell integration for prompt detection)
**Highest complexity. Can be developed in parallel with Phase 3.**

#### 4A. Prompt Detection and Mode Switching
- **Files**: New `usePromptEditor.ts`, `PromptEditorOverlay.tsx`
- **Architecture**:
  1. When `ShellIntegrationAddon` emits `promptStart`, activate the prompt editor
  2. When `commandStart` is emitted, deactivate and switch to raw PTY passthrough
  3. Detect alternate screen buffer (vim, less, htop) via `\x1b[?1049h` — disable editor entirely
  4. Detect SSH/nested shell sessions — disable editor (no shell integration in remote shell)
- **Edge cases**:
  - Tab completion from shell — when user presses Tab in the editor, must forward to PTY and capture response
  - History (Up/Down in shell) — intercept and use local history instead, or forward to shell
  - Ctrl+C at prompt — must clear the editor and send SIGINT
  - Multiline prompts (PS2 / continuation) — detect via absence of `633;A` after newline
  - Right-prompt (RPROMPT in zsh) — editor width must account for right-side prompt text

#### 4B. CodeMirror Micro-Editor for Prompt
- **Files**: New `PromptEditor.tsx`, `promptEditorExtensions.ts`
- **Implementation**:
  1. Single-line CodeMirror 6 instance (with `EditorView.lineWrapping` for multi-line expansion)
  2. Extensions:
     - Syntax highlighting for shell commands (bash/zsh grammar)
     - Bracket matching
     - History (from `useTerminalHistory`)
     - Completions (from `useTerminalCompletions` + shell Tab forwarding)
     - Vim keybindings (optional, from config)
  3. Submit: Enter sends command text to PTY + newline
  4. Multi-line: Shift+Enter for continuation lines (or auto-detect unclosed quotes/brackets)
  5. Visual: Match terminal font, colors, cursor style
  6. Position: Overlay exactly on the prompt row in the terminal viewport
- **Edge cases**:
  - Copy/paste: Must handle both editor-native and terminal-native clipboard
  - Terminal resize: Editor must reflow to match new terminal width
  - Theme change: Editor must instantly sync colors with terminal theme
  - Focus: Clicking anywhere in terminal should focus the prompt editor (when at prompt)

#### 4C. Smart Completions
- **Files**: New `useSmartCompletions.ts`
- **Sources** (merged, deduplicated, ranked):
  1. Shell built-in completions (forward Tab to PTY, parse response)
  2. File path completions (from project file index)
  3. Command history (fuzzy match from history store)
  4. Git branch/tag names (via `git branch --list`)
  5. Environment variables (from PTY env snapshot)
  6. AI-suggested commands (send context to Claude, get suggestion)
- **Edge cases**:
  - Shell Tab completion is async — must show loading state
  - Completion popup must not overflow terminal bounds
  - Multiple completion sources may conflict — use priority ranking
  - Completions during SSH — only history and AI work; shell/file/git completions unavailable

---

### Phase 5: Polish and Performance
**Parallelizable**: All tasks independent.

#### 5A. Progress Bar Integration
- **Files**: `useTerminalSetup.data.ts`, new `TerminalProgressBar.tsx`
- **Implementation**:
  1. Subscribe to progress addon events
  2. Render thin progress bar at bottom of terminal (or in tab)
  3. States: indeterminate, percent, complete, error
  4. Auto-hide after 2s of completion
- **Edge cases**: Multiple progress bars from nested commands — show only the latest

#### 5B. Session Persistence via Serialize Addon
- **Files**: `useTerminalSetup.lifecycle.ts`, session management hooks
- **Implementation**:
  1. On session close or app quit, serialize terminal buffer to HTML/text
  2. Store in electron-store or `.context/terminal-sessions/`
  3. On session restore, write serialized content to new terminal
  4. Show "Restored session" indicator
- **Edge cases**:
  - Large buffers (50K lines) — serialize asynchronously, cap at 10K most recent lines
  - Binary content in buffer — serialize addon handles this but output may be garbled

#### 5C. Terminal Font and Rendering Improvements
- **Files**: `terminalHelpers.ts`, `terminalTheme.ts`
- **Implementation**:
  1. Use `@xterm/addon-web-fonts` for guaranteed font loading before render
  2. Add ligature support (xterm 6.x built-in)
  3. Make font size, line height, cursor style configurable (currently hardcoded)
  4. Add font zoom (Ctrl+= / Ctrl+-) per terminal instance

---

## Parallel Execution Map

```
Phase 1 (all parallel):
  [1A: xterm 6.x upgrade] ─┐
  [1B: WebGL renderer]     ├─→ Phase 2
  [1C: New addons]         ─┘

Phase 2:
  [2A: Shell scripts] ──┐
  [2B: OSC 633 addon] ──├─→ [2C: Replace OSC 133] ─→ Phase 3
                        │
Phase 3 (all parallel):          Phase 4 (parallel with Phase 3):
  [3A: Visual separators] ──┐     [4A: Mode switching] ──┐
  [3B: Per-block actions]   │     [4B: CodeMirror editor] ├─→ [4C: Smart completions]
  [3C: Sticky scroll]      ─┘

Phase 5 (all parallel, anytime after Phase 1):
  [5A: Progress bar]
  [5B: Session persistence]
  [5C: Font improvements]
```

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| xterm 6.x breaking changes | HIGH | Pin exact version, audit changelog before upgrade |
| WebGL ghost cursor persists in 6.x | MEDIUM | Keep canvas fallback, add config toggle |
| Shell integration breaks user shell config | HIGH | Test with stock + customized configs; sentinel var prevents double-injection |
| Prompt editor breaks SSH/vim/tmux | HIGH | Alternate screen buffer detection; conservative mode switching |
| Performance regression with overlays | MEDIUM | Use xterm decoration API (GPU-rendered) over DOM overlays where possible |
| OSC 633 sequences not emitted by some shells | LOW | Graceful degradation to OSC 133 then heuristic mode |
