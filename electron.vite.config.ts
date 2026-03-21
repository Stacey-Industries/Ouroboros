import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

const monacoEditorPlugin = (monacoEditorPluginModule as { default: typeof monacoEditorPluginModule }).default ?? monacoEditorPluginModule

// Enable bundle analysis with ANALYZE=true npm run build
const analyze = process.env.ANALYZE === 'true'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      ...(analyze ? [visualizer({ filename: 'stats/main.html', gzipSize: true, brotliSize: true })] : []),
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
          graphWorker: resolve(__dirname, 'src/main/codebaseGraph/graphWorker.ts'),
          contextWorker: resolve(__dirname, 'src/main/orchestration/contextWorker.ts'),
        }
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin(),
      ...(analyze ? [visualizer({ filename: 'stats/preload.html', gzipSize: true, brotliSize: true })] : []),
    ],
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [
      react(),
      (monacoEditorPlugin as (opts: Record<string, unknown>) => unknown)({
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
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
