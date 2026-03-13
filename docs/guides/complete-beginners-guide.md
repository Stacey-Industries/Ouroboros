# Ouroboros — The Complete Beginner's Guide

Everything you need to understand this project, explained in plain English. No prior coding knowledge required.

---

## Table of Contents

1. [What Is Ouroboros?](#1-what-is-ouroboros)
2. [The Big Picture — How the App Works](#2-the-big-picture--how-the-app-works)
3. [The Three-Process Architecture](#3-the-three-process-architecture)
4. [Folder Structure — Where Everything Lives](#4-folder-structure--where-everything-lives)
5. [The Main Process — The Brain](#5-the-main-process--the-brain)
6. [The Preload Bridge — The Translator](#6-the-preload-bridge--the-translator)
7. [The Renderer — What You See](#7-the-renderer--what-you-see)
8. [Feature Breakdown — Every Panel Explained](#8-feature-breakdown--every-panel-explained)
9. [The Terminal](#9-the-terminal)
10. [The File Tree](#10-the-file-tree)
11. [The File Viewer / Editor](#11-the-file-viewer--editor)
12. [The Agent Monitor](#12-the-agent-monitor)
13. [The Command Palette](#13-the-command-palette)
14. [Settings](#14-settings)
15. [Git Integration](#15-git-integration)
16. [Diff Review](#16-diff-review)
17. [Multi-Session & Session Replay](#17-multi-session--session-replay)
18. [Time Travel](#18-time-travel)
19. [Usage & Cost Tracking](#19-usage--cost-tracking)
20. [Themes & Styling](#20-themes--styling)
21. [Hooks — How the IDE Talks to Claude Code](#21-hooks--how-the-ide-talks-to-claude-code)
22. [Extensions](#22-extensions)
23. [Key Technologies Used](#23-key-technologies-used)
24. [How to Run the Project](#24-how-to-run-the-project)
25. [Common Terminology Glossary](#25-common-terminology-glossary)
26. [Known Issues & Quirks](#26-known-issues--quirks)

---

## 1. What Is Ouroboros?

Ouroboros is a **desktop application** for working with an AI coding assistant called Claude Code. Think of it as a workspace where:

- You open a coding project (a folder of files)
- You type instructions to Claude Code in a terminal (a text-based command window)
- Claude Code reads your files, writes new code, runs commands — and you watch it all happen in real time
- You can review what it changed, accept or reject edits, and steer its work

The name "Ouroboros" comes from the ancient symbol of a snake eating its own tail. This is intentional — **the app was built by the very AI that runs inside it**. Claude Code literally develops Ouroboros from within a running instance of itself. It's like a painter painting a picture of themselves painting.

**Who is it for?** Developers who use Claude Code as their main coding tool and want everything — terminal, file browser, code editor, and AI activity monitor — in one window.

---

## 2. The Big Picture — How the App Works

When you open Ouroboros, you see a window split into several panels:

```
┌──────────┬─────────────────────────┬──────────────┐
│          │                         │              │
│  File    │     Code Editor         │   Agent      │
│  Tree    │     (view & edit        │   Monitor    │
│  (your   │      your files)        │   (what the  │
│  files)  │                         │   AI is      │
│          │                         │   doing)     │
│          │                         │              │
├──────────┴─────────────────────────┴──────────────┤
│                                                    │
│              Terminal                              │
│              (where you talk to Claude Code)       │
│                                                    │
└────────────────────────────────────────────────────┘
```

- **Left**: File Tree — shows all your project's files and folders, like Windows Explorer or Mac Finder
- **Centre**: Code Editor — displays the contents of whatever file you click on, with colours for different parts of the code (called "syntax highlighting")
- **Right**: Agent Monitor — shows you what Claude Code is doing: which tools it's using, how many "tokens" (words) it's processed, and how much it costs
- **Bottom**: Terminal — a text-based command line where you type instructions to Claude Code or run other commands

All of these panels can be resized by dragging the borders between them, and collapsed (hidden) if you don't need them.

---

## 3. The Three-Process Architecture

This is one of the most important concepts in the project. Ouroboros is built with a technology called **Electron**, which lets you build desktop apps using web technologies (HTML, CSS, JavaScript). Electron splits the app into three separate "processes" (independent programs running at the same time):

### Process 1: The Main Process (the brain)
- Runs behind the scenes — you never see it directly
- Has full access to your computer: reading/writing files, running terminal commands, accessing the network
- Think of it as the **backstage crew** at a theatre — it does all the heavy lifting

### Process 2: The Preload Bridge (the translator)
- Sits between the Main Process and the Renderer
- Its job is to **safely expose** specific capabilities from the Main Process to the Renderer
- Think of it as a **bouncer at a club** — it only lets approved requests through
- This exists for **security**: if the Renderer (which shows web content) were allowed to directly access your files and run commands, a malicious website could do terrible things

### Process 3: The Renderer (what you see)
- This is the actual window you look at and interact with
- Built with **React** (a popular library for building user interfaces)
- It can only do things by asking the Main Process through the Preload Bridge
- Think of it as the **front of house** at a theatre — the stage, the lights, what the audience sees

**How they communicate:** They send messages back and forth using a system called **IPC** (Inter-Process Communication). It's like passing notes:

```
Renderer: "Hey Main Process, can you read this file for me?"
     ↓ (through Preload Bridge)
Main Process: "Sure, here's the contents."
     ↓ (through Preload Bridge)
Renderer: "Thanks, I'll display it now."
```

Every message has a name following the pattern `domain:action`, like:
- `files:read` — read a file
- `pty:spawn` — start a new terminal session
- `config:set` — save a setting
- `git:status` — check what files have changed

---

## 4. Folder Structure — Where Everything Lives

Here's what each folder in the project contains:

```
ouroboros/
├── src/                          # All the source code
│   ├── main/                     # Main Process code (the brain)
│   │   ├── main.ts               # The entry point — where the app starts
│   │   ├── ipc.ts                # Routes messages from the Renderer
│   │   ├── pty.ts                # Manages terminal sessions
│   │   ├── hooks.ts              # Listens for events from Claude Code
│   │   ├── config.ts             # Saves and loads your settings
│   │   ├── lsp.ts                # Code intelligence (autocomplete, errors)
│   │   ├── extensions.ts         # Plugin/extension system
│   │   ├── menu.ts               # The app menu bar (File, Edit, View, Help)
│   │   ├── approvalManager.ts    # Approval system for AI tool use
│   │   ├── ideToolServer.ts      # Lets Claude Code query the IDE
│   │   ├── usageReader.ts        # Reads token usage data
│   │   ├── hookInstaller.ts      # Installs hook scripts for Claude Code
│   │   ├── windowManager.ts      # Manages multiple windows
│   │   └── ipc-handlers/         # Individual message handler files
│   │       ├── pty.ts            # Terminal-related messages
│   │       ├── files.ts          # File-related messages
│   │       ├── git.ts            # Git-related messages
│   │       ├── config.ts         # Settings-related messages
│   │       ├── app.ts            # App-level messages
│   │       ├── context.ts        # Project scanning messages
│   │       ├── sessions.ts       # Session save/load messages
│   │       ├── mcp.ts            # MCP server messages
│   │       ├── ideTools.ts       # IDE tool messages
│   │       └── misc.ts           # Everything else
│   │
│   ├── preload/                  # The Bridge
│   │   └── preload.ts            # Exposes safe APIs to the Renderer
│   │
│   ├── renderer/                 # What you see (the UI)
│   │   ├── App.tsx               # The root component — everything starts here
│   │   ├── index.tsx             # Bootstrap — mounts React into the page
│   │   ├── index.html            # The HTML page the app renders into
│   │   ├── components/           # All the visual pieces
│   │   │   ├── Layout/           # The overall window structure
│   │   │   ├── Terminal/         # Terminal panel
│   │   │   ├── FileTree/         # File browser panel
│   │   │   ├── FileViewer/       # Code editor panel
│   │   │   ├── AgentMonitor/     # AI activity panel
│   │   │   ├── CommandPalette/   # Quick-search command menu
│   │   │   ├── Settings/         # Settings panel
│   │   │   ├── GitPanel/         # Git changes panel
│   │   │   ├── DiffReview/       # Code review panel
│   │   │   ├── MultiSession/     # Multiple AI sessions panel
│   │   │   ├── SessionReplay/    # Replay past AI work
│   │   │   ├── TimeTravel/       # Restore past versions
│   │   │   ├── Analytics/        # Cost & usage charts
│   │   │   ├── UsageModal/       # Token usage breakdown
│   │   │   └── ContextBuilder/   # Project summary generator
│   │   ├── hooks/                # Reusable logic (not visual)
│   │   ├── contexts/             # Shared state management
│   │   ├── themes/               # Visual theme definitions
│   │   └── types/                # TypeScript type definitions
│   │
│   └── shared/                   # Code used by both Main and Renderer
│       └── pricing.ts            # AI model pricing tables
│
├── assets/                       # Non-code files
│   └── hooks/                    # Scripts that connect Claude Code to the IDE
│
├── docs/                         # Documentation
│   ├── architecture.md           # Technical architecture details
│   ├── api-contract.md           # Full list of all IPC messages
│   ├── data-model.md             # Data structures and types
│   └── guides/                   # Guides (you are here!)
│
├── ai/                           # AI development notes
│   ├── vision.md                 # Product vision and design goals
│   ├── feature-plan.md           # Planned features
│   └── deferred.md               # Features not yet built
│
├── build-resources/              # Icons and build assets
├── public/                       # Static files served as-is
├── package.json                  # Project dependencies and scripts
├── electron.vite.config.ts       # Build tool configuration
├── tsconfig.*.json               # TypeScript configuration files
├── tailwind.config.js            # Tailwind CSS configuration
├── postcss.config.js             # CSS processing configuration
└── CLAUDE.md                     # Instructions for Claude Code about this project
```

---

## 5. The Main Process — The Brain

The Main Process is the powerhouse of the app. Here's what each file does:

### `main.ts` — The Starting Line
When you launch Ouroboros, this is the first code that runs. It:
- Creates the application window
- Starts the hooks server (so Claude Code can send events to the IDE)
- Starts the IDE tool server (so Claude Code can ask the IDE questions)
- Loads extensions
- Sets up the auto-updater (checks for new versions)
- Prevents multiple instances of the app from running simultaneously
- Sends performance metrics (memory usage, CPU) to the window every 5 seconds

### `ipc.ts` — The Switchboard
This is like a telephone switchboard. When the Renderer sends a message (like "read this file"), this file routes it to the correct handler. It delegates to specialised handler files in the `ipc-handlers/` folder.

### `pty.ts` — Terminal Sessions
"PTY" stands for "pseudo-terminal" — it's a way to create virtual terminal windows. This file:
- Creates new terminal sessions (bash on Mac/Linux, PowerShell on Windows)
- Sends your keyboard input to the terminal
- Receives the terminal's output and sends it back to the Renderer to display
- Can record terminal sessions (saves everything that happens as a timestamped log)
- Handles split-pane terminals (two terminals side by side that can optionally share input)

### `hooks.ts` — The Event Listener
This is one of the most unique parts of Ouroboros. It creates a **named pipe server** — think of it as a private telephone line that only Claude Code knows the number to. When Claude Code does something (starts working, uses a tool, finishes a task), it calls this number and reports what happened. The hooks server then broadcasts these events to the Renderer so the Agent Monitor can display them.

Events it listens for:
- `session_start` / `session_stop` — Claude Code began/finished working
- `pre_tool_use` — Claude Code is about to use a tool (and might need your approval)
- `post_tool_use` — Claude Code just used a tool (here's what happened)
- `agent_start` / `agent_stop` / `agent_end` — A sub-agent was spawned or finished

### `config.ts` — Your Settings
Uses a library called `electron-store` to save your preferences to a JSON file on disk. This includes:
- Panel sizes and window position
- Which theme you're using
- Font choices and sizes
- Recent projects you've opened
- Claude Code settings (which AI model to use, permission levels, etc.)
- Keyboard shortcuts
- Extension settings

### `lsp.ts` — Code Intelligence
"LSP" stands for "Language Server Protocol" — it's a standard way for code editors to get smart features like:
- **Autocomplete**: Suggesting what to type next
- **Error detection**: Red squiggly lines under mistakes
- **Go to definition**: Click a function name to jump to where it's defined
- **Hover info**: Hover over something to see what it does

This file starts and manages language servers (one per programming language) and forwards their responses to the editor.

### `extensions.ts` — Plugin System
Allows you to install plugins that add extra features. Extensions live in `~/.ouroboros/extensions/` (a folder in your home directory). Each extension has a `package.json` that describes what it does and when it should activate.

### `approvalManager.ts` — The Safety Gate
When Claude Code wants to do something potentially risky (like writing to a file or running a command), this system can ask for your approval first. You see a dialog asking "Allow this?" and can approve or deny. You can also set rules like "always allow read operations" so it doesn't ask every time.

### `ideToolServer.ts` — Reverse Communication
This is fascinating — it lets Claude Code ask the IDE questions. Normally the IDE tells Claude Code what to do, but this flips it around. Claude Code can ask things like:
- "What file does the user have open?"
- "What text is selected?"
- "What's in the terminal right now?"

### `usageReader.ts` — Token Counter
Reads Claude Code's usage logs to tell you how many "tokens" (roughly: words) you've used and how much it costs. Claude Code writes these logs to a file on your computer, and this code reads and processes them.

### `hookInstaller.ts` — Setup Helper
Automatically copies the hook scripts (the code that tells Claude Code how to talk to the IDE) into the right place on your computer so everything connects properly.

### `menu.ts` — The Menu Bar
Creates the menu bar at the top of the window (File, Edit, View, Help) with options like:
- File → Open Folder (pick a project)
- File → New Window
- File → New Terminal
- View → Settings

---

## 6. The Preload Bridge — The Translator

There's only one file here: `preload.ts`. It's about 420 lines long and its entire job is to create a safe bridge between the Main Process and the Renderer.

It exposes an object called `window.electronAPI` that the Renderer can use. This object has methods for everything the Renderer might need to do:

```
window.electronAPI.files.read(path)      → asks Main Process to read a file
window.electronAPI.pty.spawn(options)     → asks Main Process to start a terminal
window.electronAPI.config.set(key, value) → asks Main Process to save a setting
window.electronAPI.git.status()           → asks Main Process for git status
```

**Why not just let the Renderer talk directly to the computer?** Security. The Renderer is essentially a web page, and web pages shouldn't have direct access to your file system, terminal, or network. The Preload Bridge acts as a controlled gateway — it only exposes specific, vetted operations.

The full list of what's exposed is organised into categories:
- **PTY**: Terminal operations (spawn, write, resize, kill)
- **Config**: Settings (get, set, import, export)
- **Files**: File operations (read, write, delete, rename, watch for changes)
- **Git**: Version control (status, diff, blame, log, branches, commits)
- **Hooks**: Agent events (subscribe to Claude Code activity)
- **App**: Application-level (version number, open URLs, notifications)
- **Theme**: Visual theme (get, set, listen for changes)
- **Sessions**: Save/load past agent sessions
- **Cost**: Token cost tracking
- **Usage**: Usage summaries and statistics
- **LSP**: Code intelligence
- **Approval**: Tool use approval system
- **Window**: Multi-window management
- **Extensions**: Plugin management
- **MCP**: Model Context Protocol server configuration
- **Context**: Project scanning
- **IDE Tools**: Reverse communication channel
- **Updater**: App update management

---

## 7. The Renderer — What You See

The Renderer is the entire user interface — everything you look at and click on. It's built with **React**, which is a way of building UIs by composing small, reusable pieces called "components."

### Entry Points

**`index.tsx`** — The very first thing that runs in the Renderer. It:
1. Prevents the browser from navigating away if you accidentally drag a file onto the window
2. Mounts (starts) the React application
3. Dismisses the splash screen (the loading screen you see briefly when the app starts)

**`App.tsx`** — The root component. Think of it as the container that holds everything else. It:
- Wraps the entire app in "providers" (shared state that any component can access)
- Renders the main layout, command palette, settings panel, and usage panel
- Listens for keyboard shortcuts and menu events
- Loads your theme and configuration on startup

### Contexts (Shared State)

"Contexts" in React are a way to share data across many components without passing it through every level. The app has several:

- **ProjectContext** — Knows which project folder(s) you have open
- **AgentEventsContext** — Tracks all Claude Code activity (sessions, tool calls, status)
- **ApprovalContext** — Manages the queue of approval requests from Claude Code
- **FocusContext** — Tracks which panel you're currently focused on (for keyboard shortcuts)
- **ToastContext** — Manages temporary notification pop-ups ("File saved!", "Error occurred")

### Hooks (Reusable Logic)

"Hooks" in React are reusable pieces of logic that aren't visual. The app has about 18 custom hooks:

- **useConfig** — Read and write settings
- **useTheme** — Apply visual themes
- **usePty** — Interact with terminal sessions
- **useAgentEvents** — Track Claude Code's activity over time
- **useFileWatcher** — Watch for file changes on disk
- **useGitStatus** — Check which files have changed in git
- **useDiffSnapshots** — Track versions for time-travel
- **useUpdater** — Check for app updates
- **useFileHeatMap** — Track how often files are accessed (shows "hot" files)
- **useCommandBlocks** — Group terminal output into blocks (command + its output)

---

## 8. Feature Breakdown — Every Panel Explained

The app is divided into distinct feature areas, each in its own folder under `src/renderer/components/`. Let's walk through every one.

---

## 9. The Terminal

**Location**: `src/renderer/components/Terminal/`

The terminal is where you interact with Claude Code and run commands. It's like the Command Prompt on Windows or Terminal on Mac, but embedded in the app.

### How It Works

The terminal uses a library called **xterm.js** (`@xterm/xterm`), which is the same technology that powers the terminal in VS Code. It renders a real terminal experience in the browser — with colours, cursor movement, scrollback history, and everything you'd expect.

### Key Components

- **`TerminalManager.tsx`** — The boss. It manages all open terminal sessions. If you have three terminal tabs open, TerminalManager renders three TerminalInstance components and keeps track of which one is active.

- **`TerminalInstance.tsx`** — A single terminal window. This is where xterm.js lives. It:
  - Creates an xterm instance and connects it to a real shell (bash, zsh, or PowerShell) via the PTY system
  - Handles keyboard input (sends your keystrokes to the shell)
  - Displays output (what the shell sends back)
  - Has a toolbar with buttons for recording, search, split pane, and close
  - Blocks certain escape sequences that would try to override your theme colours

- **`TerminalTabs.tsx`** — The tab bar above the terminal. Each tab represents a terminal session. You can:
  - Click "+" to open a new terminal
  - Right-click a tab for options (rename, close, split, kill)
  - Click a tab to switch to it

### Extra Features

- **`SearchBar.tsx`** — Find text within the terminal output (like Ctrl+F in a browser)
- **`CommandHistorySearch.tsx`** — Press Ctrl+R to search through your command history (previous commands you've typed)
- **`BlockNavigator.tsx`** — Navigate between "command blocks" — each command and its output grouped as a single unit, inspired by the Warp terminal
- **`CommandBlockOverlay.tsx`** — Visual grouping that draws a border around each command + its output
- **`RichInput.tsx`** — An enhanced input area at the terminal prompt that supports multi-line editing
- **`SelectionTooltip.tsx`** — When you select text in the terminal, a "Copy" button appears
- **`PasteConfirmation.tsx`** — A security feature that warns you before pasting text (in case you accidentally paste something dangerous)
- **`CompletionOverlay.tsx`** — Autocomplete suggestions as you type
- **`CopyButton.tsx`** — A button to copy terminal content
- **`terminalRegistry.ts`** — Stores references to all terminal instances so other parts of the app can access them (e.g., when Claude Code asks "what's in the terminal?")
- **`terminalHelpers.ts`** — Utility functions for detecting which shell is running and parsing prompts
- **`terminalLinkProvider.ts`** — Makes URLs and file paths in terminal output clickable

### Technical Quirk
xterm.js has a timing issue: after creating a terminal, you must wait for two animation frames before telling it to resize itself, otherwise it crashes. The code uses a pattern called "double-rAF" (request Animation Frame) to handle this. There's also a guard (`isReadyRef`) that prevents any resize attempts before the terminal is fully initialised.

---

## 10. The File Tree

**Location**: `src/renderer/components/FileTree/`

The file tree is the panel on the left that shows all the files and folders in your project. It works like the file explorer in any operating system.

### Key Components

- **`FileTree.tsx`** — The main component. It:
  - Shows a hierarchical (nested) view of all files and folders
  - Supports multiple project roots (you can have several folders open at once)
  - Uses "virtualisation" — only renders the files currently visible on screen, which keeps it fast even for projects with thousands of files
  - Colour-codes files based on their git status:
    - **Green** = new file (not yet tracked by git)
    - **Yellow/Orange** = modified file
    - **Red** = deleted file
    - **Grey** = ignored file
  - Has a search overlay (Ctrl+Shift+F) for filtering files by name

- **`FileTreeItem.tsx`** — A single row in the file tree (one file or folder). Handles:
  - Click to select (opens the file in the editor)
  - Double-click to open permanently (single-click opens in "preview" mode)
  - Right-click for context menu
  - Drag (for future drag-and-drop support)

- **`ContextMenu.tsx`** — The right-click menu with options like:
  - New File / New Folder
  - Rename
  - Delete (moves to trash, doesn't permanently delete)
  - Copy Path (copies the file's location to your clipboard)

- **`FileTypeIcon.tsx`** — Shows different icons based on the file type (e.g., a JavaScript icon for `.js` files, a Python icon for `.py` files)

- **`FolderIcon.tsx`** — Folder icons with an arrow that rotates when you expand/collapse

- **`SearchOverlay.tsx`** — A search bar that appears at the top of the file tree, letting you filter files by typing part of their name

- **`fileTreeUtils.ts`** — Behind-the-scenes utilities:
  - Builds the tree structure from a flat list of files
  - Normalises file paths (handles differences between Windows backslashes and Unix forward slashes)
  - Checks ignore patterns (like `.gitignore`) to hide files you don't want to see

- **`fileIcons.ts`** — A mapping of file extensions to icon names (e.g., `.ts` → TypeScript icon, `.py` → Python icon)

---

## 11. The File Viewer / Editor

**Location**: `src/renderer/components/FileViewer/`

This is the centre panel where you view and edit file contents. It's a lightweight code editor with syntax highlighting (colouring different parts of code to make it readable).

### Key Components

- **`FileViewerManager.tsx`** — Manages all open file tabs. It tracks:
  - Which files are open
  - Which file is currently active (visible)
  - Whether a file has unsaved changes ("dirty")
  - Whether a file changed on disk while you were looking at it
  - Whether a file is an image (images get displayed differently)

- **`FileViewer.tsx`** — The actual editor. Uses **CodeMirror 6**, a popular code editor library. It provides:
  - Syntax highlighting for 14+ languages (JavaScript, Python, Rust, SQL, YAML, Markdown, JSON, XML, HTML, CSS, Java, C++, and more)
  - Line numbers
  - Code folding (collapse sections you don't need to see)
  - Find and replace
  - Autocomplete (from the LSP system)
  - Error highlighting (red underlines under problems)

- **`FileViewerTabs.tsx`** — The tab bar showing all open files. Click a tab to switch, click the X to close, unsaved files show a dot indicator.

### Supporting Features

- **`Breadcrumb.tsx`** — Shows the path to the current file at the top (e.g., `src > renderer > components > FileViewer`). Each segment is clickable to navigate up the tree.

- **`SearchBar.tsx`** — In-file search (Ctrl+F). Find text within the current file, with options for case-sensitive and regex search. Also supports find-and-replace.

- **`GoToLine.tsx`** — Jump to a specific line number (Ctrl+G).

- **`SymbolOutline.tsx`** — A sidebar showing all the functions, classes, and important symbols in the current file. Click one to jump to it.

- **`Minimap.tsx`** — A tiny overview of the entire file shown in the scrollbar area (like VS Code's minimap). Helps you see where you are in a long file.

- **`SemanticScrollbar.tsx`** — Shows coloured marks in the scrollbar for:
  - Git changes (where lines were added/removed)
  - Search results (where matches are)
  - Errors and warnings (where problems are)

- **`DiffView.tsx`** — Shows differences between two versions of a file, either side-by-side or in a unified view (added lines in green, removed lines in red).

- **`BlameGutter.tsx`** — Shows who last edited each line, when, and in which commit. This is called "git blame" — it tells you who to "blame" for each line of code (it's not as aggressive as it sounds!).

- **`CommitHistory.tsx`** — A list of recent commits (save points) that affected the current file.

- **`MarkdownPreview.tsx`** — If you open a Markdown file (`.md`), this shows a rendered preview — headings, bold text, links, lists, etc. look like a formatted document instead of raw code.

- **`ImageViewer.tsx`** — If you open an image file (PNG, JPG, SVG, etc.), this displays it instead of trying to show it as text.

- **`InlineEditor.tsx`** — Allows editing file content directly. Changes aren't saved until you explicitly save.

- **`ConflictResolver.tsx`** — When two people edit the same file and git can't merge them automatically, you get a "merge conflict." This component helps you resolve it by showing both versions and letting you choose which to keep.

- **`ClaudeMdEditor.tsx`** — A specialised editor for `CLAUDE.md` files (the instruction files that tell Claude Code how to work with a project).

- **`EmptyState.tsx`** — What you see when no file is open ("Open a file from the file tree").

- **`LoadingState.tsx`** — A loading indicator while a file is being read.

- **`editorRegistry.ts`** — Stores references to all CodeMirror editor instances so other parts of the app can access them.

- **`fileViewerUtils.ts`** — Utility functions for things like detecting file type and language.

---

## 12. The Agent Monitor

**Location**: `src/renderer/components/AgentMonitor/`

This is one of Ouroboros's most unique features. It shows you **everything Claude Code is doing** in real time — which tools it's using, what files it's reading, what commands it's running, and how much it's all costing.

### Key Components

- **`AgentMonitorManager.tsx`** — The main orchestrator. It:
  - Separates "live" sessions (currently running) from "historical" ones (finished)
  - Has a collapsible "Previous Sessions" section
  - Supports a "compare mode" to view two sessions side by side
  - Lets you dismiss, bookmark, or add notes to sessions

### Display Modes (different ways to view the same data)

- **`AgentCard.tsx`** — A compact card showing key info at a glance:
  - Status indicator (running, completed, failed — shown as a coloured dot)
  - Task label (what Claude Code is working on)
  - Token count (how many words it's processed)
  - Cost estimate (how much money it's using)
  - Elapsed time
  - Number of tool calls made

- **`AgentTree.tsx`** — A tree view showing the hierarchy of agents. When Claude Code spawns "subagents" (smaller AIs to handle subtasks), this shows the parent-child relationships:
  ```
  Main Agent (researching feature)
  ├── Subagent 1 (reading files)
  └── Subagent 2 (searching code)
      └── Sub-subagent (reading a specific file)
  ```

- **`AgentEventLog.tsx`** — A chronological list of every event, in order. Like a detailed diary of everything that happened.

- **`ToolCallFeed.tsx`** — A live stream of tool calls. Shows you in real time as Claude Code reads files, writes code, runs commands, etc.

- **`ToolCallTimeline.tsx`** — A visual timeline showing tool calls as horizontal bars. Longer bars mean the tool took longer to run. Helps you spot bottlenecks.

- **`CostDashboard.tsx`** — A breakdown of costs:
  - Per model (Opus costs more than Sonnet, which costs more than Haiku)
  - Total tokens used (input vs output)
  - Estimated dollar amount spent

### Supporting Components

- **`AgentSummaryBar.tsx`** — A bar at the top showing: how many agents are running, total cost so far, and a "clear completed" button.

- **`ApprovalDialog.tsx`** — A popup asking "Claude Code wants to [action]. Allow?" with Approve/Deny buttons. Part of the safety system.

- **`costCalculator.ts`** — The maths behind cost estimation. Takes the number of tokens used and the model name, and calculates the cost based on published pricing.

- **`notificationBuilder.ts`** — Formats desktop notifications (the pop-ups that appear in your system tray) when an agent finishes its work.

- **`types.ts`** — Defines the data structures for agent sessions and tool calls.

---

## 13. The Command Palette

**Location**: `src/renderer/components/CommandPalette/`

The Command Palette is a quick-search menu that pops up when you press **Ctrl+K** (or Cmd+K on Mac). It lets you find and run any command in the app without touching the mouse — just type what you want to do.

### How It Works

1. Press Ctrl+K
2. A search box appears in the centre of the screen
3. Start typing (e.g., "new terminal" or "open settings")
4. Matching commands appear in a filtered list
5. Press Enter to run the selected command

It uses **fuzzy matching** (via a library called Fuse.js), which means you don't have to type the exact command name. Typing "ntrm" would still find "New Terminal" because it matches the pattern.

### Key Components

- **`CommandPalette.tsx`** — The main popup. Shows:
  - Search input
  - Recent commands (things you've done before)
  - Filtered results grouped by category (App, File, Terminal, Git, View, Extensions)
  - Keyboard shortcut hints next to each command

- **`CommandItem.tsx`** — A single command in the list, showing its name, category, and keyboard shortcut.

- **`FilePicker.tsx`** — A specialised variant that searches for files by name (triggered by Ctrl+P). Type part of a filename and it shows matching files from your project.

- **`SymbolSearch.tsx`** — Another variant that searches for code symbols — function names, class names, etc. (triggered by Ctrl+Shift+O).

- **`useCommandRegistry.ts`** — The hook that registers all available commands. Each command has:
  - A label (what you see)
  - A category (for grouping)
  - An action (what happens when you select it)
  - An optional keyboard shortcut
  - An optional "when" condition (only show this command in certain situations)

---

## 14. Settings

**Location**: `src/renderer/components/Settings/`

The Settings panel lets you customise every aspect of the app. It renders as a panel in the centre area (replacing the code editor).

### Settings Tabs

1. **General** (`GeneralSection.tsx`)
   - Default project folder
   - Recent projects list
   - Auto-install hooks (whether to automatically set up the Claude Code connection)

2. **Appearance** (`AppearanceSection.tsx`)
   - Theme picker (retro, modern, warp, cursor, kiro, or custom)
   - Gradient toggle (subtle background gradient effect)
   - Custom colour editor (create your own theme)

3. **Fonts** (`FontSection.tsx`)
   - UI font (the font used for labels, menus, etc.)
   - Monospace font (the font used for code and terminal)
   - Font size controls

4. **Terminal** (`TerminalSection.tsx`)
   - Terminal font size
   - Default shell (bash, zsh, PowerShell)
   - Command blocks toggle (group commands with their output)

5. **Claude Code** (`ClaudeSection.tsx`)
   - Permission mode (how much autonomy Claude Code gets)
   - Model override (force a specific AI model)
   - Effort level (how hard the AI thinks about each task)
   - System prompt (custom instructions for Claude Code)
   - Tool allowlists (which tools Claude Code can use)
   - Budget limits (maximum spending)
   - Worktree toggle (isolated git workspace for agent work)

6. **Keybindings** (`KeybindingsSection.tsx`)
   - Map keyboard shortcuts to actions
   - See all current shortcuts
   - Reset to defaults

7. **Hooks** (`HooksSection.tsx`)
   - Hook server port number
   - Auto-install toggle
   - Custom hook scripts

8. **Profiles** (`ProfilesSection.tsx`)
   - Save your current settings as a named profile
   - Load/apply previously saved profiles
   - Useful if you switch between different workflows

9. **Files** (`FileFilterSection.tsx`)
   - Custom ignore patterns (hide certain files from the file tree)
   - Works like `.gitignore` — you type patterns like `*.log` to hide all log files

10. **Extensions** (`ExtensionsSection.tsx`)
    - List installed extensions
    - Enable/disable extensions
    - Uninstall extensions

11. **MCP** (`McpSection.tsx`)
    - Configure MCP (Model Context Protocol) servers
    - Two scopes: global (for all projects) and project-specific
    - Add, remove, enable/disable servers

### Supporting Components

- **`SettingsPanel.tsx`** — The container that renders the tab bar and the active tab's content
- **`settingsEntries.ts`** — A registry of all settings with their labels, types, default values, and descriptions
- **`settingsStyles.tsx`** — Shared styling for form elements (toggle switches, inputs, dropdowns)
- **`ToggleSwitch.tsx`** — The on/off toggle control used throughout settings

---

## 15. Git Integration

**Location**: `src/renderer/components/GitPanel/` + `src/main/ipc-handlers/git.ts`

Git is a "version control system" — it tracks changes to your files over time, like an unlimited undo history. Ouroboros has deep git integration.

### What You Can Do

- **See which files changed** — The file tree shows colour-coded indicators
- **View diffs** — See exactly what changed in each file (added lines in green, removed lines in red)
- **Stage changes** — Select which changes to include in your next save point (called a "commit")
- **Write commits** — Save a snapshot of your changes with a description
- **Switch branches** — Work on different versions of your project
- **View blame** — See who last edited each line and when
- **View history** — See a list of all past commits for a file
- **Create snapshots** — Manual save points you can return to later

### Key Components

- **`GitPanel.tsx`** — The main panel showing:
  - Staged files (ready to commit) and unstaged files (changed but not ready)
  - Buttons to stage/unstage individual files or all files
  - A text box for writing your commit message
  - A branch dropdown for switching branches

- **`BranchSelector.tsx`** — Dropdown for switching between git branches

- **`GitFileRow.tsx`** — A single file in the git panel with a status indicator and stage/unstage toggle

---

## 16. Diff Review

**Location**: `src/renderer/components/DiffReview/`

Diff Review is a dedicated mode for reviewing changes that Claude Code made. Instead of looking at the raw git diff, you get a structured interface for accepting or rejecting individual changes.

### How It Works

1. Claude Code makes a bunch of changes across multiple files
2. You enter Diff Review mode
3. You see a list of all changed files on the left
4. For each file, changes are broken into "hunks" (groups of related changes)
5. For each hunk, you can click "Accept" (keep this change) or "Reject" (undo this change)
6. A progress bar shows how many hunks you've reviewed

### Key Components

- **`DiffReviewPanel.tsx`** — The main UI with:
  - File sidebar (list of changed files with acceptance status icons)
  - Diff display with syntax highlighting
  - Accept/Reject buttons for each hunk
  - Bulk actions (accept all, reject all)

- **`DiffReviewManager.tsx`** — Manages the state: loading diffs, tracking decisions, applying patches

- **`FileListSidebar.tsx`** — The left sidebar listing all changed files

- **`HunkView.tsx`** — Renders a single hunk (group of changes) with + and - lines

---

## 17. Multi-Session & Session Replay

### Multi-Session

**Location**: `src/renderer/components/MultiSession/`

You can run multiple Claude Code sessions at the same time! Multi-Session gives you a grid view of all running sessions.

- **`MultiSessionMonitor.tsx`** — Shows 2-4 sessions in a grid layout, each with:
  - Status indicator
  - Live tool call feed
  - Token count and cost
  - Elapsed time

- **`MultiSessionLauncher.tsx`** — A dialog for starting multiple sessions at once, each with its own prompt

### Session Replay

**Location**: `src/renderer/components/SessionReplay/`

After Claude Code finishes a task, you can "replay" the session step by step, like watching a recording.

- **`SessionReplayPanel.tsx`** — A timeline slider that lets you scrub through the session
  - Step list showing each event in order
  - Details panel for the selected step
  - See exactly what Claude Code did at each point in time

---

## 18. Time Travel

**Location**: `src/renderer/components/TimeTravel/`

Time Travel lets you restore your project to a previous state. It shows a list of snapshots (save points) and lets you jump back to any of them.

- **`TimeTravelPanel.tsx`** — Lists snapshots with:
  - Timestamp
  - Description (e.g., "Before agent session", "Manual snapshot")
  - Number of files changed
  - A "Restore" button that stashes your current changes and checks out the old version

Think of it like the "undo" button, but for your entire project — you can go back to how things looked an hour ago, yesterday, or last week.

---

## 19. Usage & Cost Tracking

**Location**: `src/renderer/components/UsageModal/` + `src/renderer/components/Analytics/`

Using Claude Code costs money (you pay per token — roughly per word). These panels help you track spending.

### Usage Panel (`UsageModal/`)

- **`UsagePanel.tsx`** — Shows a breakdown of token usage:
  - Per session (how much each conversation cost)
  - Per model (Opus vs Sonnet vs Haiku — different models cost different amounts)
  - Windowed usage (how much you've used in the last 5 hours, this week)

### Analytics Dashboard (`Analytics/`)

- **`AnalyticsDashboard.tsx`** — Visual charts showing:
  - Cost trends over time
  - Session breakdown (which sessions cost the most)
  - Model distribution (which AI models you use most)

### Pricing (`src/shared/pricing.ts`)

The pricing table for different AI models:
- **Opus** — The most capable and expensive model
- **Sonnet** — Mid-range (good balance of capability and cost)
- **Haiku** — The fastest and cheapest model

---

## 20. Themes & Styling

**Location**: `src/renderer/themes/`

Ouroboros comes with 5 built-in themes plus a custom theme editor.

### Built-in Themes

1. **Retro** — A nostalgic CRT-monitor look with green/amber monochrome text and scanline effects
2. **Modern** — Clean, minimal design with a contemporary feel
3. **Warp** — Bright and energetic, inspired by the Warp terminal
4. **Cursor** — Purple and sleek, inspired by the Cursor editor
5. **Kiro** — A unique warm-cool contrast theme

### How Theming Works

Themes use **CSS custom properties** (also called "CSS variables"). Instead of saying "make this button blue," the code says "make this button `var(--accent)`." Then the theme defines what `--accent` actually is — maybe blue in one theme, purple in another, green in another.

Key variables:
- `--bg` — Background colour
- `--text` — Text colour
- `--accent` — Highlight/interactive colour
- `--border` — Border colour
- `--font-ui` — UI font family
- `--font-mono` — Code font family
- `--term-bg` — Terminal background
- `--term-fg` — Terminal text colour
- `--term-cursor` — Terminal cursor colour

This means changing the entire app's appearance is as simple as swapping which set of values is active — no need to change any component code.

### Tailwind CSS

The app also uses **Tailwind CSS**, a utility-first CSS framework. Instead of writing custom CSS classes, you apply pre-built classes directly:
- `bg-gray-900` → dark grey background
- `text-white` → white text
- `p-4` → padding on all sides
- `flex` → flexbox layout
- `rounded-lg` → large rounded corners

However, for colours that change with themes, Tailwind classes are combined with CSS variables.

---

## 21. Hooks — How the IDE Talks to Claude Code

**Location**: `assets/hooks/` + `src/main/hooks.ts`

"Hooks" are the communication system between Claude Code and the IDE. They let the IDE know what Claude Code is doing in real time.

### How It Works

1. When Ouroboros starts, it creates a **named pipe server** — think of it as a private communication channel
2. When Claude Code starts a session, a hook script runs that connects to this channel
3. As Claude Code works (reads files, writes code, runs commands), it sends event messages through the channel
4. Ouroboros receives these events and displays them in the Agent Monitor

### Hook Scripts

- **`session_start.sh`** / **`session_start.ps1`** — Runs when Claude Code starts. Detects the hook server and establishes the connection. The `.sh` version is for Mac/Linux, the `.ps1` version is for Windows.

- **`pre_tool_use.sh`** / **`pre_tool_use.ps1`** — Runs before Claude Code uses a tool. Can request approval from the user before allowing the action.

- **`ide-query.ps1`** — Lets Claude Code ask the IDE questions (what file is open, what text is selected, etc.)

### Event Types

- `session_start` — "Claude Code started working"
- `session_stop` — "Claude Code finished"
- `pre_tool_use` — "Claude Code wants to use [tool]. OK?"
- `post_tool_use` — "Claude Code just used [tool]. Here's what happened."
- `agent_start` / `agent_stop` / `agent_end` — Subagent lifecycle events

### The Named Pipe

On Windows, the communication happens through a "named pipe" at `\\.\pipe\agent-ide-hooks`. On other systems, it falls back to a TCP connection on `localhost:3333`. Named pipes are faster and more secure than network connections because they only work on the local machine.

---

## 22. Extensions

**Location**: `src/main/extensions.ts` + `src/renderer/components/Settings/ExtensionsSection.tsx`

Extensions are plugins that add extra features to Ouroboros. They live in a folder on your computer (`~/.ouroboros/extensions/`).

### How They Work

1. Each extension is a folder with a `package.json` file describing:
   - What the extension does
   - When it should activate (e.g., when you open a Python file, when you run a specific command)
   - What capabilities it provides

2. Ouroboros scans the extensions folder on startup
3. Extensions activate based on their trigger conditions
4. They can add commands, modify behaviour, and send notifications

### Managing Extensions

In the Settings → Extensions tab, you can:
- See all installed extensions
- Enable or disable extensions
- Uninstall extensions
- View extension logs (for debugging)
- Open the extensions folder

---

## 23. Key Technologies Used

Here's a glossary of the main technologies this project depends on:

| Technology | What It Is | Why It's Used |
|---|---|---|
| **Electron** | Framework for building desktop apps with web technologies | Lets us build a native desktop app using HTML, CSS, and JavaScript |
| **React** | Library for building user interfaces | Makes it easy to create complex, interactive UIs by composing small components |
| **TypeScript** | A typed version of JavaScript | Catches errors before the code runs by requiring you to declare what type of data things are |
| **Tailwind CSS** | Utility-first CSS framework | Makes styling fast by providing pre-built CSS classes |
| **xterm.js** | Terminal emulator for the browser | Powers the terminal panel |
| **CodeMirror 6** | Code editor for the browser | Powers the file viewer/editor with syntax highlighting |
| **node-pty** | Pseudo-terminal library | Creates real terminal sessions that xterm.js connects to |
| **electron-store** | Persistent storage | Saves your settings to a JSON file |
| **chokidar** | File watcher | Detects when files change on disk |
| **Fuse.js** | Fuzzy search | Powers the command palette's search |
| **shiki** | Syntax highlighter | Colours code in previews and diffs |
| **electron-vite** | Build tool | Compiles and bundles the code for development and production |
| **vitest** | Test framework | Runs automated tests to verify the code works |
| **electron-builder** | Packaging tool | Creates installable apps (.exe for Windows, .dmg for Mac, .AppImage for Linux) |
| **electron-updater** | Auto-update library | Checks for and installs new versions of the app |
| **DOMPurify** | HTML sanitiser | Cleans HTML to prevent security attacks (cross-site scripting) |
| **vscode-languageserver-protocol** | Code intelligence protocol | Enables autocomplete, error detection, and go-to-definition |
| **vscode-jsonrpc** | JSON-RPC library | Communication protocol for language servers |

---

## 24. How to Run the Project

### Prerequisites

1. **Node.js** — The JavaScript runtime. Download from https://nodejs.org (use the LTS version)
2. **npm** — Comes with Node.js. It's a package manager that installs dependencies
3. **Git** — Version control. Download from https://git-scm.com

### Steps

1. **Install dependencies** — Open a terminal in the project folder and run:
   ```
   npm install
   ```
   This downloads all the libraries the project needs (listed in `package.json`).

2. **Start development mode** — Run:
   ```
   npm run dev
   ```
   This starts the app with "hot reload" — when you change code, the app updates automatically without restarting.

3. **Build for production** — Run:
   ```
   npm run build
   ```
   This creates an optimised version of the app in the `out/` folder.

4. **Create an installer** — Run:
   ```
   npm run dist
   ```
   This packages the app into an installer (`.exe` on Windows, `.dmg` on Mac, `.AppImage` on Linux) in the `dist/` folder.

5. **Run tests** — Run:
   ```
   npm test
   ```
   This runs the automated test suite to check that everything works correctly.

### Important Warning

If you're running this app **from within itself** (which is the normal development workflow), **never kill the Electron process**. That would terminate the very app you're using. Instead, use hot reload (code changes apply automatically) or ask the user to press Ctrl+R to reload the window.

---

## 25. Common Terminology Glossary

| Term | Plain English Meaning |
|---|---|
| **API** | "Application Programming Interface" — a set of defined ways for programs to talk to each other |
| **Bridge** | A connector between two systems that normally can't communicate directly |
| **Callback** | A function that runs after something else finishes ("call me back when you're done") |
| **Component** | A reusable piece of UI (like a button, a panel, a tab bar) |
| **Context** | In React, a way to share data across many components without passing it through each level |
| **CSS Variables** | Placeholder values in stylesheets (like `--bg: #1e1e2e`) that can be changed to update the whole look |
| **Diff** | The difference between two versions of a file (what was added, removed, or changed) |
| **DOM** | "Document Object Model" — the browser's representation of the page as a tree of elements |
| **Electron** | A framework that lets you build desktop apps using web technologies |
| **Event** | Something that happens (a click, a keypress, a file change) that code can react to |
| **Git** | A version control system that tracks changes to files over time |
| **Hook (React)** | A function that lets you use React features like state and effects in function components |
| **Hook (Claude Code)** | A script that runs at specific points during Claude Code's work (like "before using a tool") |
| **HMR** | "Hot Module Replacement" — updating code in a running app without restarting it |
| **Hunk** | A group of related changes in a diff (a chunk of added/removed/modified lines) |
| **IPC** | "Inter-Process Communication" — how the Main Process and Renderer send messages to each other |
| **JSON** | "JavaScript Object Notation" — a format for storing data as key-value pairs: `{ "name": "Alice", "age": 30 }` |
| **LSP** | "Language Server Protocol" — a standard for code intelligence features like autocomplete and error detection |
| **MCP** | "Model Context Protocol" — a standard for AI models to interact with external tools and data sources |
| **Named Pipe** | A communication channel between programs on the same computer (like a private phone line) |
| **NDJSON** | "Newline-Delimited JSON" — one JSON object per line, used for streaming data |
| **Node.js** | A runtime that lets you run JavaScript outside of a browser |
| **npm** | "Node Package Manager" — a tool for installing and managing JavaScript libraries |
| **OSC** | "Operating System Command" — special codes that terminals use to control behaviour |
| **Preload** | A script that runs before the web page loads, with special permissions to bridge main and renderer |
| **Process** | An independent program running on your computer |
| **Provider** | In React, a component that makes data available to all its children via Context |
| **PTY** | "Pseudo-Terminal" — a virtual terminal that programs can read from and write to |
| **rAF** | "requestAnimationFrame" — a browser function that runs code on the next screen refresh |
| **React** | A library for building user interfaces by composing small, reusable pieces called components |
| **Reducer** | A function that takes the current state and an action, and returns new state (used for complex state logic) |
| **Renderer** | The Electron process that displays the UI (essentially a browser window) |
| **State** | Data that changes over time and causes the UI to update when it changes |
| **Syntax Highlighting** | Colouring different parts of code (keywords, strings, numbers) to make it easier to read |
| **Tailwind** | A CSS framework that provides utility classes you apply directly to elements |
| **Token** | The basic unit AI models process — roughly one word or part of a word |
| **TypeScript** | JavaScript with added type checking (catches errors before you run the code) |
| **Virtualisation** | Only rendering the items currently visible on screen (for performance with large lists) |
| **Worktree** | An isolated copy of a git repository for parallel work |
| **xterm.js** | A library that renders a terminal in a web browser |

---

## 26. Known Issues & Quirks

Things to be aware of that might confuse you:

1. **Double Tab Bar** — The terminal area has two tab bars (one from TerminalPane and one from TerminalManager). This is a known bug that needs fixing by consolidating the state.

2. **File Watching Gap** — The `files:watchDir` IPC handler is registered but never actually called from the Renderer. File change detection works passively (when you open or save a file) rather than actively watching.

3. **Settings Modal Disconnect** — There are two settings systems: an inline modal in App.tsx and the Settings components in the Settings folder. They should be unified.

4. **Menu Event Mismatch** — The app menu sends a `menu:settings` event, but the settings listener expects an `agent-ide:open-settings` DOM event. These are two different event systems that got mixed up.

5. **xterm.js Pitfalls** — If you work on the terminal code, remember:
   - Must use `@xterm/xterm` (NOT the legacy `xterm` package — they're incompatible)
   - Must wait for two animation frames after `term.open()` before calling `fit()`
   - Must NOT use the WebGL addon (it causes ghost cursor artefacts)
   - Must block OSC 10/11/12 sequences (they try to override theme colours)

6. **Self-Hosted Development** — The app is literally developed from within itself. This means you can never kill the Electron process during development (that would terminate your own workspace). Use hot reload instead.

---

## Final Notes

Ouroboros is a large, feature-rich project with a clean architecture and strong typing. If you're new to coding, don't try to understand everything at once. Start with one area that interests you:

- **Curious about how UIs work?** Start with the Renderer components (`src/renderer/components/`)
- **Curious about how apps access your computer?** Start with the Main Process (`src/main/`)
- **Curious about how data flows?** Follow an IPC message from the Renderer through the Preload Bridge to the Main Process and back
- **Want to change how the app looks?** Explore the themes (`src/renderer/themes/`) and Tailwind classes

The best way to learn is to pick one small feature, read its code, and try to change something small. The app has hot reload, so you'll see your changes instantly.

Welcome to the codebase!
