import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { registerFilePathLinks } from './terminalLinkProvider'
import {
  getCssVar,
  buildXtermTheme,
} from './terminalHelpers'
import {
  INITIAL_SELECTION_TOOLTIP,
} from './SelectionTooltip'
import { cleanupTerminalSetup } from './useTerminalSetupCleanup'
import {
  handleClick,
  handleMouseUp,
  setupCustomKeyHandler,
  setupKeyHandler,
} from './useTerminalSetupInteractions'
import {
  setupDataBridge,
  setupInputBridge,
} from './useTerminalSetupData'
import { registerTerminal } from './terminalRegistry'
import type {
  AttachedTerminalDisposables,
  TerminalSetupLifecycleContext,
} from './useTerminalSetup.shared'

export function createBootstrapTerminal(
  context: TerminalSetupLifecycleContext,
): (container: HTMLDivElement) => () => void {
  return function bootstrapTerminal(container: HTMLDivElement): () => void {
    const term = createTerminal()
    loadTerminalAddons(context, term, container)
    registerTerminal(context.sessionId, term)
    context.refs.terminalRef.current = term

    const disposables = attachAllHandlers(context, container, term)
    return () => cleanupTerminalSetup(context, container, term, disposables)
  }
}

function createTerminal(): Terminal {
  return new Terminal({
    fontFamily: getCssVar('--font-mono') || 'monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    cursorInactiveStyle: 'none',
    scrollback: 5000,
    allowProposedApi: true,
    theme: buildXtermTheme(),
  })
}

function loadTerminalAddons(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
  container: HTMLDivElement,
): void {
  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    void window.electronAPI.app.openExternal(uri)
  })

  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(webLinksAddon)
  term.open(container)
  context.refs.fitAddonRef.current = fitAddon
  context.refs.searchAddonRef.current = searchAddon
}

function attachAllHandlers(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
  term: Terminal,
): AttachedTerminalDisposables {
  const terminalDisposables = createTerminalDisposables(context, term)
  const containerHandlers = attachContainerHandlers(context, container, term)
  const selD = term.onSelectionChange(() => {
    if (!term.getSelection()) context.callbacks.setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
  })
  const ro = createReadyObserver(context, container)

  return { ...terminalDisposables, ...containerHandlers, selD, ro }
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
    titleD: term.onTitleChange((title) => context.callbacks.onTitleChange?.(context.sessionId, title)),
    dataCleanup: setupDataBridge(context, term),
    inputD: setupInputBridge(context, term),
    histKeyD: setupKeyHandler(context, term),
  }
}

function attachContainerHandlers(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
  term: Terminal,
): Pick<AttachedTerminalDisposables, 'clickHandler' | 'mouseUpHandler'> {
  setupCustomKeyHandler(context, term)
  const clickHandler = (event: MouseEvent) => handleClick(context.runtimeRefs, event, container, term)
  const mouseUpHandler = (event: MouseEvent) => handleMouseUp(context, event, term)
  container.addEventListener('click', clickHandler)
  container.addEventListener('mouseup', mouseUpHandler)
  return { clickHandler, mouseUpHandler }
}

function createReadyObserver(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
): ResizeObserver {
  const ro = new ResizeObserver(() => context.fit())
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      context.refs.isReadyRef.current = true
      ro.observe(container)
      context.fit()
    })
  })
  return ro
}
