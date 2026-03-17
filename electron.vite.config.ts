import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'
import { visualizer } from 'rollup-plugin-visualizer'

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
          index: resolve(__dirname, 'src/main/main.ts')
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
