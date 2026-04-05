import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { ProgressAddon } from '@xterm/addon-progress';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';

import { INITIAL_SELECTION_TOOLTIP } from './SelectionTooltip';
import { ShellIntegrationAddon } from './shellIntegrationAddon';
import { buildXtermTheme, getCssVar } from './terminalHelpers';
import { registerFilePathLinks } from './terminalLinkProvider';
import { registerTerminal } from './terminalRegistry';
import type {
  AttachedTerminalDisposables,
  TerminalSetupLifecycleContext,
} from './useTerminalSetup.shared';
import { cleanupTerminalSetup } from './useTerminalSetupCleanup';
import { setupDataBridge, setupInputBridge } from './useTerminalSetupData';
import {
  handleClick,
  handleMouseUp,
  setupCustomKeyHandler,
  setupKeyHandler,
} from './useTerminalSetupInteractions';

export function createBootstrapTerminal(
  context: TerminalSetupLifecycleContext,
): (container: HTMLDivElement) => () => void {
  return function bootstrapTerminal(container: HTMLDivElement): () => void {
    const term = createTerminal(context.initialFontSize, context.initialCursorStyle);
    loadTerminalAddons(context, term, container);
    registerTerminal(context.sessionId, term);
    context.refs.terminalRef.current = term;

    const disposables = attachAllHandlers(context, container, term);
    return () => cleanupTerminalSetup(context, container, term, disposables);
  };
}

function createTerminal(fontSize?: number, cursorStyle?: 'block' | 'underline' | 'bar'): Terminal {
  return new Terminal({
    fontFamily: getCssVar('--font-mono') || 'monospace',
    fontSize: fontSize ?? 13,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: cursorStyle ?? 'block',
    cursorInactiveStyle: 'none',
    scrollback: 50000,
    allowProposedApi: true,
    allowTransparency: true,
    theme: buildXtermTheme(),
  });
}

function loadCoreAddons(
  _context: TerminalSetupLifecycleContext,
  term: Terminal,
  container: HTMLDivElement,
): { fitAddon: FitAddon; searchAddon: SearchAddon } {
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    void window.electronAPI.app.openExternal(uri);
  });
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(webLinksAddon);
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      console.warn('[terminal:webgl] context loss — disposing WebGL addon');
      webgl.dispose();
    });
    term.loadAddon(webgl);
    _context.refs.webglAddonRef.current = webgl;
    console.warn('[terminal:webgl] loaded BEFORE term.open()');
  } catch (err) {
    console.warn('[terminal:webgl] failed to load:', err);
  }
  term.open(container);
  console.warn(
    '[terminal:webgl] term.open() complete, renderer:',
    (term as unknown as Record<string, unknown>)._core ? 'active' : 'unknown',
  );
  return { fitAddon, searchAddon };
}

function loadOptionalAddons(context: TerminalSetupLifecycleContext, term: Terminal): void {
  try {
    const imageAddon = new ImageAddon({
      sixelPaletteLimit: 512,
      sixelSizeLimit: 25000000,
      enableSizeReports: true,
    });
    term.loadAddon(imageAddon);
  } catch {
    /* image addon not critical */
  }
  try {
    term.loadAddon(new ClipboardAddon());
  } catch {
    /* clipboard addon not critical */
  }
  try {
    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    context.refs.serializeAddonRef.current = serializeAddon;
  } catch {
    /* serialize addon not critical */
  }
  try {
    const unicodeAddon = new UnicodeGraphemesAddon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = 'graphemes';
  } catch {
    /* unicode graphemes addon not critical */
  }
  try {
    const progressAddon = new ProgressAddon();
    term.loadAddon(progressAddon);
    context.refs.progressAddonRef.current = progressAddon;
  } catch {
    /* progress addon not critical */
  }
  try {
    const shellIntegrationAddon = new ShellIntegrationAddon();
    term.loadAddon(shellIntegrationAddon);
    context.refs.shellIntegrationAddonRef.current = shellIntegrationAddon;
  } catch {
    /* shell integration addon not critical */
  }
}

function loadTerminalAddons(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
  container: HTMLDivElement,
): void {
  const { fitAddon, searchAddon } = loadCoreAddons(context, term, container);
  loadOptionalAddons(context, term);
  context.refs.fitAddonRef.current = fitAddon;
  context.refs.searchAddonRef.current = searchAddon;
}

function attachAllHandlers(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
  term: Terminal,
): AttachedTerminalDisposables {
  const terminalDisposables = createTerminalDisposables(context, term);
  const containerHandlers = attachContainerHandlers(context, container, term);
  const selD = term.onSelectionChange(() => {
    if (!term.getSelection()) context.callbacks.setSelectionTooltip(INITIAL_SELECTION_TOOLTIP);
  });
  const ro = createReadyObserver(context, container);

  return { ...terminalDisposables, ...containerHandlers, selD, ro };
}

function createTerminalDisposables(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): Omit<AttachedTerminalDisposables, 'clickHandler' | 'mouseUpHandler' | 'selD' | 'ro'> {
  return {
    filePathLink: registerFilePathLinks(term, () => context.projectRootRef.current),
    oscFg: term.parser.registerOscHandler(10, () => true),
    oscBg: term.parser.registerOscHandler(11, () => true),
    oscCursor: term.parser.registerOscHandler(12, () => true),
    titleD: term.onTitleChange((title) =>
      context.callbacks.onTitleChange?.(context.sessionId, title),
    ),
    dataCleanup: setupDataBridge(context, term),
    inputD: setupInputBridge(context, term),
    histKeyD: setupKeyHandler(context, term),
  };
}

function attachContainerHandlers(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
  term: Terminal,
): Pick<AttachedTerminalDisposables, 'clickHandler' | 'mouseUpHandler'> {
  setupCustomKeyHandler(context, term);
  const clickHandler = (event: MouseEvent) =>
    handleClick(context.runtimeRefs, event, container, term);
  const mouseUpHandler = (event: MouseEvent) => handleMouseUp(context, event, term);
  container.addEventListener('click', clickHandler);
  container.addEventListener('mouseup', mouseUpHandler);
  return { clickHandler, mouseUpHandler };
}

function createReadyObserver(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
): ResizeObserver {
  const ro = new ResizeObserver(() => context.fit());
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      context.refs.isReadyRef.current = true;
      ro.observe(container);
      context.fit();
    });
  });
  return ro;
}
