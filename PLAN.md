# Ouroboros — Build Plan

## Overview
Electron desktop app for launching and monitoring Claude Code sessions.
Zed/Warp-inspired UI with configurable typography themes.

## Architecture

```
src/
  main/              # Electron main process
    main.ts           # Entry point, BrowserWindow, IPC
    pty.ts            # node-pty session management
    hooks.ts          # Named pipe server for hook events
    config.ts         # electron-store config management
    menu.ts           # Application menu
  preload/
    preload.ts        # contextBridge IPC exposure
  renderer/           # React app
    App.tsx
    index.tsx
    components/
      Layout/
        AppLayout.tsx         # Three-column + terminal layout
        Sidebar.tsx           # Left sidebar container
        CentrePane.tsx        # File viewer container
        AgentMonitor.tsx      # Right sidebar container
        TerminalPane.tsx      # Bottom terminal container
        ResizeHandle.tsx      # Drag handles for panels
      FileTree/
        FileList.tsx          # Filtered file list (v1 — not full tree)
        FileListItem.tsx
        ProjectPicker.tsx     # Folder picker + recent projects
      FileViewer/
        FileViewer.tsx        # Read-only syntax-highlighted viewer
        FileViewerTabs.tsx    # Multi-tab file viewer bar
        Breadcrumb.tsx
      AgentMonitor/
        AgentCard.tsx         # Per-agent status card
        AgentSummaryBar.tsx   # "3 agents: 2 running, 1 complete"
        ToolCallFeed.tsx      # Live tool call events
        AgentEventLog.tsx     # Expanded event log
      Terminal/
        TerminalTabs.tsx      # Tab bar for terminal sessions
        TerminalTab.tsx       # Single xterm.js instance
      CommandPalette/
        CommandPalette.tsx    # Ctrl+Shift+P fuzzy command search
        useCommandRegistry.ts
      Settings/
        SettingsModal.tsx
        ThemePicker.tsx
    hooks/
      useTheme.ts
      useConfig.ts
      useAgentEvents.ts
      usePty.ts
      useFileWatcher.ts
    themes/
      index.ts
      retro.ts
      modern.ts
      warp.ts
      cursor.ts
      kiro.ts
    styles/
      globals.css
```

## Build Phases

### Phase 1 — Scaffold & Core (agents 1-3, parallel)
1. **Project Init**: package.json, tsconfig, Electron + Vite config, Tailwind
2. **Main Process**: BrowserWindow with security hardening, IPC bridge, electron-store
3. **Renderer Shell**: React app, AppLayout with resizable panels, theme system

### Phase 2 — Terminal & PTY (agent 4)
4. **Terminal**: xterm.js + node-pty integration, tabbed sessions, lifecycle mgmt

### Phase 3 — File & Agent Panels (agents 5-6, parallel)
5. **File Viewer**: Filtered file list, multi-tab read-only viewer, chokidar watcher
6. **Agent Monitor**: Card UI, WebSocket event feed, summary bar

### Phase 4 — Hooks & Commands (agents 7-8, parallel)
7. **Hooks System**: Named pipe server, platform-appropriate hook scripts, event relay
8. **Command Palette**: Fuzzy search, action registry, keyboard shortcuts

### Phase 5 — Polish
9. **Settings**: Modal, theme picker, config persistence
10. **Deferred items**: Document in DEFERRED.md

## Security Hardening (Phase 1, non-negotiable)
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `contextBridge` for all IPC
- CSP headers
- DOMPurify for agent monitor content

## Key Dependencies
- electron
- electron-vite (or electron-forge + vite)
- react, react-dom
- xterm, @xterm/addon-fit, @xterm/addon-webgl
- node-pty
- chokidar
- electron-store
- dompurify
- fuse.js (command palette fuzzy search)
- shiki (syntax highlighting)
- tailwindcss

## Font Bundling
Fonts in `assets/fonts/`:
- JetBrains Mono (Retro)
- Inter + Geist Mono (Modern)
- Hack (Warp)
- Menlo/SF Mono fallback (Cursor)
- IBM Plex Mono (Kiro)

Downloaded from Google Fonts / GitHub releases, bundled as .woff2.
