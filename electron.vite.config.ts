import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { cpSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin } from 'vite'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

/**
 * copyTemplates — copies src/main/templates/ → out/main/templates/ at build
 * time so runtime code (e.g. specScaffold.ts) can read them via __dirname.
 * Runs in closeBundle to ensure the output directory exists first.
 */
function copyTemplatesPlugin(): Plugin {
  return {
    name: 'copy-main-templates',
    closeBundle(): void {
      const src = resolve(__dirname, 'src/main/templates')
      const dest = resolve(__dirname, 'out/main/templates')
      mkdirSync(dest, { recursive: true })
      cpSync(src, dest, { recursive: true })
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM interop: vite-plugin-monaco-editor may export default or module directly
const monacoEditorPlugin = ((monacoEditorPluginModule as unknown as { default: typeof monacoEditorPluginModule }).default ?? monacoEditorPluginModule) as unknown as (opts: Record<string, unknown>) => import('vite').Plugin

// Enable bundle analysis with ANALYZE=true npm run build
const analyze = process.env.ANALYZE === 'true'

// Paths the Vite dev-server file watcher should ignore. Without this, any
// file created/deleted via the IDE's file tree (or by an agent) triggers a
// full Electron restart because electron-vite treats every FS event in the
// project root as a source change.
const watchIgnored = [
  '**/node_modules/**',
  '**/out/**',
  '**/.git/**',
  '**/dist/**',
  '**/coverage/**',
  '**/docs/**',
  '**/plan/**',
  '**/ai/**',
  '**/stats/**',
  '**/.vite/**',
  '**/*.md',
  '**/.env*',
]

export default defineConfig({
  main: {
    plugins: [
      copyTemplatesPlugin(),
      ...(analyze ? [visualizer({ filename: 'stats/main.html', gzipSize: true, brotliSize: true })] : []),
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    },
    server: {
      watch: { ignored: watchIgnored }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-vite v5 types omit rollupOptions (vite 6 BuildEnvironmentOptions); runtime supports it
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
          indexingWorker: resolve(__dirname, 'src/main/codebaseGraph/indexingWorker.ts'),
          contextWorker: resolve(__dirname, 'src/main/orchestration/contextWorker.ts'),
          ptyHostMain: resolve(__dirname, 'src/main/ptyHost/ptyHostMain.ts'),
          extensionHostMain: resolve(__dirname, 'src/main/extensionHost/extensionHostMain.ts'),
          mcpHostMain: resolve(__dirname, 'src/main/mcpHost/mcpHostMain.ts'),
        }
      }
    } as any,
  },
  preload: {
    plugins: [
      ...(analyze ? [visualizer({ filename: 'stats/preload.html', gzipSize: true, brotliSize: true })] : []),
    ],
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    },
    server: {
      watch: { ignored: watchIgnored }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-vite v5 types omit rollupOptions (vite 6 BuildEnvironmentOptions); runtime supports it
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/preload.ts')
        }
      }
    } as any,
  },
  renderer: {
    root: 'src/renderer',
    publicDir: resolve(__dirname, 'public'),
    plugins: [
      react({
        babel: {
          plugins: [
            ['babel-plugin-react-compiler', {}],
          ],
        },
      }),
      monacoEditorPlugin({
        languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
        globalAPI: false,
        customDistPath: (_root: string, _buildOutDir: string, _base: string) =>
          resolve(__dirname, 'out/renderer/monacoeditorwork'),
      }),
      ...(analyze ? [visualizer({ filename: 'stats/renderer.html', gzipSize: true, brotliSize: true })] : []),
    ],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    server: {
      watch: { ignored: watchIgnored }
    },
    optimizeDeps: {
      // Vite already invalidates its dep cache when package.json or lockfile
      // changes, so forcing on every cold start is unnecessary and adds 20-30s
      // to dev startup (full re-bundle of Monaco + Shiki languages). Opt in via
      // FORCE_OPTIMIZE_DEPS=1 when you specifically need a clean re-scan
      // (e.g. after `npm install` failed mid-run or branch switches that
      // skipped lockfile updates).
      force: process.env.FORCE_OPTIMIZE_DEPS === '1',
    },
    css: {
      postcss: resolve(__dirname, 'postcss.config.js')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-vite v5 types omit rollupOptions (vite 6 BuildEnvironmentOptions); runtime supports it
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    } as any,
  }
})
