/**
 * vite.web.config.ts — Builds the renderer as a standalone web app.
 *
 * Outputs to out/web/. Uses the same React app as the Electron renderer,
 * but served from a web server instead of a BrowserWindow.
 *
 * The web preload (IIFE shim) is built separately by vite.webpreload.config.ts.
 */

import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

const monacoEditorPlugin =
  (monacoEditorPluginModule as { default: typeof monacoEditorPluginModule }).default ??
  monacoEditorPluginModule

/**
 * Injects the webPreload.js script tag into the HTML using Vite's
 * transformIndexHtml hook, which runs during the build pipeline.
 */
function injectWebPreload(): Plugin {
  return {
    name: 'inject-web-preload',
    enforce: 'post',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { src: '/webPreload.js' },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

/**
 * Moves index.html from out/web/src/web/ to out/web/ after the build.
 * Vite preserves directory structure relative to the project root.
 */
function moveHtmlToRoot(): Plugin {
  return {
    name: 'move-html-to-root',
    closeBundle() {
      const outDir = resolve(__dirname, 'out/web')
      const nested = resolve(outDir, 'src/web/index.html')
      const target = resolve(outDir, 'index.html')

      if (existsSync(nested)) {
        renameSync(nested, target)
        try {
          rmSync(resolve(outDir, 'src'), { recursive: true })
        } catch {
          // ignore if not empty
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    (monacoEditorPlugin as (opts: Record<string, unknown>) => unknown)({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
      globalAPI: false,
      customDistPath: (_root: string, _buildOutDir: string, _base: string) =>
        resolve(__dirname, 'out/web/monacoeditorwork'),
    }),
    injectWebPreload(),
    moveHtmlToRoot(),
  ],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/web/index.html'),
      },
    },
  },
})
