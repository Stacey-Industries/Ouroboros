import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

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
          graphWorker: resolve(__dirname, 'src/main/codebaseGraph/graphWorker.ts'),
          contextWorker: resolve(__dirname, 'src/main/orchestration/contextWorker.ts'),
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
      react(),
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
      // Force Vite to re-scan deps on dev cold starts. Prevents stale hash
      // mismatches when deps change while the dev server isn't running
      // (npm install, branch switches, force-kills during debugging).
      // Disabled in production builds to avoid unnecessary re-bundling.
      force: process.env.NODE_ENV !== 'production',
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
