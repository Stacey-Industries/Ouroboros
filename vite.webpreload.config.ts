/**
 * vite.webpreload.config.ts — Builds the web preload shim as a standalone IIFE.
 *
 * The web preload must execute synchronously before the React app loads,
 * so it's built as an IIFE (not an ES module). It sets up window.electronAPI
 * using a WebSocket transport instead of Electron IPC.
 *
 * Output: out/web/webPreload.js
 */

import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: false, // Don't wipe the renderer build
    lib: {
      entry: resolve(__dirname, 'src/web/webPreload.ts'),
      name: 'webPreload',
      formats: ['iife'],
      fileName: () => 'webPreload.js',
    },
    rollupOptions: {
      output: {
        // No code splitting — single IIFE file
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    sourcemap: true,
  },
})
