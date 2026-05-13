# Build Configuration & Tooling

Build pipeline and tooling config for the Ouroboros Electron desktop IDE. Three build targets (main/preload/renderer) plus an optional web deployment mode.

## Key Files

| File | Role |
|---|---|
| `electron.vite.config.ts` | Primary build — three targets: `main` (Node), `preload` (Node), `renderer` (React + Monaco). Run with `npm run build`. |
| `vite.web.config.ts` | Web deployment build — same React renderer served over HTTP. Outputs to `out/web/`. Injects `webPreload.js` via `transformIndexHtml` and relocates `index.html` from `out/web/src/web/` to `out/web/` via `closeBundle`. |
| `vite.webpreload.config.ts` | Builds `src/web/webPreload.ts` as an IIFE — provides `window.electronAPI` over WebSocket for web mode. Must run **after** `vite.web.config.ts`. Uses `emptyOutDir: false` to preserve the renderer build. |
| `vitest.config.ts` | Unit tests — Node env, `src/**/*.test.ts`, V8 coverage. Thresholds at 5% (ratchet up over time). Aliases `mica-electron` to a stub and `better-sqlite3` to a system-Node build. |
| `knip.config.ts` | Dead code detection. Entry points: `main.ts`, `preload.ts`, `preloadSupplementalApis.ts`, `index.tsx`. `src/renderer/types/**` excluded (declaration files only). |
| `playwright.config.ts` | E2E test config. |
| `postcss.config.js` | Tailwind + Autoprefixer only. No custom transforms. |

## Build Targets

```
electron.vite.config.ts
  ├── main     → src/main/main.ts          (Node.js, deps externalized)
  ├── preload  → src/preload/preload.ts    (Node.js, isolated renderer context)
  └── renderer → src/renderer/index.html  (Browser, React, Monaco workers, Tailwind)

vite.web.config.ts        → out/web/              (browser deployment)
vite.webpreload.config.ts → out/web/webPreload.js  (IIFE shim, must build last)
```

## Path Aliases

| Alias | Resolves to | Available in |
|---|---|---|
| `@main/*` | `src/main/*` | main, preload |
| `@preload/*` | `src/preload/*` | preload |
| `@renderer/*` | `src/renderer/*` | renderer, web |
| `@shared/*` | `src/shared/*` | all targets |

## Monaco Workers

The renderer bundles 5 Monaco language workers: `editorWorkerService`, `typescript`, `json`, `css`, `html`. Workers output to `out/renderer/monacoeditorwork/` (Electron) or `out/web/monacoeditorwork/` (web).

## Bundle Analysis

```bash
ANALYZE=true npm run build
```

Outputs `stats/main.html`, `stats/preload.html`, `stats/renderer.html` via `rollup-plugin-visualizer`.

## Gotchas

- **Monaco plugin CJS/ESM interop**: `vite-plugin-monaco-editor` exports a CJS default — both configs wrap it with `.default ?? module`. Do not simplify this.
- **`optimizeDeps.force: true` in dev**: Forces Vite dep re-scan on cold starts. Prevents stale hash mismatches after `npm install`. Set to `false` in production.
- **Web build ordering matters**: Run `vite.web.config.ts` first, then `vite.webpreload.config.ts`. Reversing the order wipes the renderer output (`emptyOutDir: false` only protects against the preload build doing the wiping).
- **`index.html` relocation**: `moveHtmlToRoot` plugin in `vite.web.config.ts` renames `out/web/src/web/index.html` → `out/web/index.html` in `closeBundle`. Vite preserves project-relative directory structure; this corrects it.
- **`better-sqlite3` in vitest**: The project's native addon is compiled against Electron's Node ABI. Vitest runs under system Node (different ABI), so `vitest.config.ts` aliases `better-sqlite3` to a separately-installed system-Node build at `%LOCALAPPDATA%/Temp/sqlite-fresh/`. Tests that import it will fail silently if that directory doesn't exist.
- **`mica-electron` must be inlined**: `vitest.config.ts` uses `server.deps.inline: ['mica-electron']` so the `resolve.alias` redirect to a stub fires before the module calls `electron.app.commandLine.appendSwitch()` at load time. Removing the inline entry breaks vitest startup.
- **File watcher exclusions**: `electron.vite.config.ts` ignores `roadmap/docs/`, `roadmap/`, `ai/`, `stats/`, `*.md`, etc. to prevent agent/IDE file changes from triggering hot-reload restarts.
- **Tailwind only scans `src/renderer/`**: Classes used in main or preload code won't appear in the CSS bundle.
- **`src/renderer/types/**` excluded from knip**: These are `.d.ts` declaration files — knip can't analyze them as entry consumers.
- **`src/main/templates/` copied at build time**: `copyTemplatesPlugin` in `electron.vite.config.ts` copies `src/main/templates/` → `out/main/templates/` via `closeBundle`. `specScaffold.ts` reads templates via `path.join(__dirname, '..', 'templates', 'spec')` at runtime. Without the copy, `/spec` fails silently in production builds.
