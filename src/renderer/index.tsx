import './styles/fonts.css'
import './styles/globals.css'

import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

// ── Prevent Electron's default file-drop navigation ──────────────────────────
// Without this, dropping a file anywhere on the window causes Electron to
// navigate to the file URL (like a browser). Individual components (FileTree)
// handle drop events locally; this just stops the fallback navigation.
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found. Check index.html has <div id="root"></div>')
}

// ── Splash screen dismissal ───────────────────────────────────────────────────
// The splash <div id="splash"> is injected in index.html and visible immediately.
// We trigger a fade-out ~300ms after React mounts so the app has time to render
// at least one frame before the splash disappears.

function dismissSplash(): void {
  const splash = document.getElementById('splash')
  if (!splash) return

  // Trigger CSS fade-out transition (500ms, defined in index.html)
  requestAnimationFrame(() => {
    splash.classList.add('splash-fade-out')
    // Remove from DOM after transition completes
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
    // Safety fallback in case transitionend doesn't fire
    setTimeout(() => splash.remove(), 600)
  })
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Dismiss after a brief delay to let the first React frame paint
setTimeout(dismissSplash, 300)
