import './styles/fonts.css';
import './styles/globals.css';

import log from 'electron-log/renderer';
import type { ErrorInfo, ReactNode } from 'react';
import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

// renderer-bundle-loaded: bundle is parsed, all top-level imports resolved.
// Fires before React mounts — captures Vite transform + chunk-load time.
window.electronAPI?.perf?.mark?.('renderer-bundle-loaded').catch(() => void 0);

// ── Root error boundary ───────────────────────────────────────────────────────
// Inline intentionally — must work even if the module graph or CSS has failed.
// Same pattern as ChatErrorBoundary in InnerAppLayout.tsx.

interface RootErrorBoundaryState {
  error: Error | null;
}

const CRASH_STYLES = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0d1117',
    color: '#e6edf3',
    fontFamily: 'system-ui, sans-serif',
    padding: '32px',
    boxSizing: 'border-box' as const,
  },
  card: { maxWidth: '480px', width: '100%', textAlign: 'center' as const },
  label: {
    fontSize: '14px',
    color: '#8b949e',
    marginBottom: '8px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  heading: { fontSize: '20px', fontWeight: 600, margin: '0 0 12px', color: '#e6edf3' },
  message: {
    fontSize: '13px',
    color: '#8b949e',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '12px 16px',
    margin: '0 0 24px',
    wordBreak: 'break-word' as const,
    textAlign: 'left' as const,
    fontFamily: 'monospace',
  },
  button: {
    background: '#1f6feb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('Uncaught render error:', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      const { error } = this.state;
      return (
        <div style={CRASH_STYLES.root}>
          <div style={CRASH_STYLES.card}>
            <div style={CRASH_STYLES.label}>Ouroboros</div>
            <h1 style={CRASH_STYLES.heading}>Something went wrong</h1>
            {error.message && <p style={CRASH_STYLES.message}>{error.message}</p>}
            <button
              onClick={() => {
                window.location.reload();
              }}
              style={CRASH_STYLES.button}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Prevent Electron's default file-drop navigation ──────────────────────────
// Without this, dropping a file anywhere on the window causes Electron to
// navigate to the file URL (like a browser). Individual components (FileTree)
// handle drop events locally; this just stops the fallback navigation.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Check index.html has <div id="root"></div>');
}

// ── Splash screen dismissal ───────────────────────────────────────────────────
// The splash <div id="splash"> is injected in index.html and visible immediately.
// We trigger a fade-out ~300ms after React mounts so the app has time to render
// at least one frame before the splash disappears.

function dismissSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  // Trigger CSS fade-out transition (500ms, defined in index.html)
  requestAnimationFrame(() => {
    splash.classList.add('splash-fade-out');
    // Remove from DOM after transition completes
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    // Safety fallback in case transitionend doesn't fire
    setTimeout(() => splash.remove(), 600);
  });
}

const root =
  (rootElement as unknown as { _reactRoot?: ReturnType<typeof createRoot> })._reactRoot ??
  createRoot(rootElement);
(rootElement as unknown as { _reactRoot?: ReturnType<typeof createRoot> })._reactRoot = root;

// react-root-created: createRoot() returned; React tree not yet committed.
window.electronAPI?.perf?.mark?.('react-root-created').catch(() => void 0);

root.render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);

// Double-rAF guarantees first frame is committed before marking.
// Uses perf.mark('first-render') which also flushes the startup log.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.electronAPI.perf.mark('first-render').catch(() => void 0);
  });
});

// Dismiss after a brief delay to let the first React frame paint
setTimeout(dismissSplash, 300);
