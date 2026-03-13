/**
 * RichInput — CodeMirror-powered multi-line input overlay for the terminal.
 *
 * Sits below xterm output, activated by Ctrl+Shift+Enter. Provides:
 * - Multi-line editing with syntax highlighting (shell/bash via StreamLanguage)
 * - Input history navigation (Ctrl+Up / Ctrl+Down)
 * - Submit via Ctrl+Enter or Shift+Enter, Escape to cancel
 * - Auto-grow up to 10 lines, then scroll
 * - Terminal-matched theme colors
 */

import React, { useRef, useEffect, useCallback, useState, memo } from 'react'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  placeholder as cmPlaceholder,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
  StreamLanguage,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags } from '@lezer/highlight'

// ─── Simple shell/bash language via StreamLanguage ────────────────────────────

const shellLanguage = StreamLanguage.define({
  token(stream) {
    // Comments
    if (stream.match('#')) {
      stream.skipToEnd()
      return 'comment'
    }
    // Strings
    if (stream.match(/"([^"\\]|\\.)*"/)) return 'string'
    if (stream.match(/'[^']*'/)) return 'string'
    // Backtick commands
    if (stream.match(/`[^`]*`/)) return 'string'
    // Variable expansion
    if (stream.match(/\$\{[^}]*\}/)) return 'variableName'
    if (stream.match(/\$[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName'
    if (stream.match(/\$[0-9#?@!$*-]/)) return 'variableName'
    // Numbers
    if (stream.match(/\b\d+\b/)) return 'number'
    // Operators / pipes
    if (stream.match(/[|&;><]+/)) return 'operator'
    // Keywords
    if (stream.match(/\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|source|alias|unalias|local|readonly|declare|typeset|set|unset|shift|trap|break|continue|select|until|coproc|time)\b/)) {
      return 'keyword'
    }
    // Common commands (highlight as functions)
    if (stream.match(/\b(cd|ls|cp|mv|rm|mkdir|rmdir|cat|echo|grep|sed|awk|find|sort|uniq|wc|head|tail|chmod|chown|curl|wget|git|npm|npx|node|python|pip|docker|ssh|scp|tar|zip|unzip|make|cmake|cargo|go|rustc|gcc|clang|claude)\b/)) {
      return 'atom'
    }
    // Flags
    if (stream.match(/-{1,2}[A-Za-z0-9_-]+/)) return 'attributeName'
    // Fallback: eat one character
    stream.next()
    return null
  },
  startState() {
    return {}
  },
})

// ─── Theme-aware highlight styles ─────────────────────────────────────────────

function buildTerminalHighlightStyle(): HighlightStyle {
  return HighlightStyle.define([
    { tag: tags.keyword,        color: 'var(--rich-input-keyword, #ff79c6)' },
    { tag: tags.comment,        color: 'var(--rich-input-comment, #6272a4)', fontStyle: 'italic' },
    { tag: tags.string,         color: 'var(--rich-input-string, #f1fa8c)' },
    { tag: tags.variableName,   color: 'var(--rich-input-variable, #8be9fd)' },
    { tag: tags.number,         color: 'var(--rich-input-number, #bd93f9)' },
    { tag: tags.operator,       color: 'var(--rich-input-operator, #ff79c6)' },
    { tag: tags.atom,           color: 'var(--rich-input-command, #50fa7b)' },
    { tag: tags.attributeName,  color: 'var(--rich-input-flag, #ffb86c)' },
  ])
}

// ─── Editor theme matching terminal vars ──────────────────────────────────────

const richInputEditorTheme = EditorView.theme({
  '&': {
    fontSize: 'var(--term-font-size, 13px)',
    backgroundColor: 'transparent',
    color: 'var(--term-fg, var(--text, #f8f8f2))',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: '1.5',
    overflow: 'auto',
    maxHeight: 'calc(1.5em * 10 + 16px)', // 10 lines max + padding
  },
  '.cm-content': {
    caretColor: 'var(--term-cursor, var(--accent, #f8f8f0))',
    padding: '4px 0',
    minHeight: '1.5em',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--term-cursor, var(--accent, #f8f8f0))',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--term-selection, rgba(88,166,255,0.25))',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--term-selection, rgba(88,166,255,0.15))',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-faint, #555)',
    borderRight: '1px solid var(--border, #333)',
    minWidth: '2.5em',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  // Hide scrollbar unless hovering
  '.cm-scroller::-webkit-scrollbar': {
    width: '6px',
  },
  '.cm-scroller::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--border, #444)',
    borderRadius: '3px',
  },
})

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RichInputProps {
  sessionId: string
  onSubmit: (text: string) => void
  onCancel: () => void
  visible: boolean
  shellType?: 'bash' | 'zsh' | 'powershell' | 'cmd'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50

// ─── Component ────────────────────────────────────────────────────────────────

export const RichInput = memo(function RichInput({
  sessionId,
  onSubmit,
  onCancel,
  visible,
  shellType,
}: RichInputProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const highlightCompartment = useRef(new Compartment())
  const lineNumCompartment = useRef(new Compartment())

  // Refs for callbacks to avoid stale closures
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Input history state
  const historyItems = useRef<string[]>([])
  const historyIndex = useRef(-1) // -1 means not navigating history
  const currentDraft = useRef('') // what user was typing before navigating history

  // Line numbers toggle
  const [showLineNumbers, setShowLineNumbers] = useState(false)

  // ── Submit handler ─────────────────────────────────────────────────────────

  const doSubmit = useCallback(() => {
    const view = viewRef.current
    if (!view) return

    const text = view.state.doc.toString().trim()
    if (!text) return

    // Add to history (deduplicate)
    const items = historyItems.current
    const existingIdx = items.indexOf(text)
    if (existingIdx >= 0) items.splice(existingIdx, 1)
    items.unshift(text)
    if (items.length > MAX_HISTORY) items.length = MAX_HISTORY

    // Reset history navigation
    historyIndex.current = -1
    currentDraft.current = ''

    // Clear the editor
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' },
    })

    onSubmitRef.current(text)
  }, [])

  // ── Cancel handler ─────────────────────────────────────────────────────────

  const doCancel = useCallback(() => {
    const view = viewRef.current
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' },
      })
    }
    historyIndex.current = -1
    currentDraft.current = ''
    onCancelRef.current()
  }, [])

  // ── History navigation ─────────────────────────────────────────────────────

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    const view = viewRef.current
    if (!view) return

    const items = historyItems.current
    if (items.length === 0) return

    let idx = historyIndex.current

    if (direction === 'up') {
      if (idx === -1) {
        // Save current content as draft before navigating
        currentDraft.current = view.state.doc.toString()
        idx = 0
      } else if (idx < items.length - 1) {
        idx++
      } else {
        return // Already at oldest
      }
    } else {
      if (idx <= 0) {
        // Return to draft
        idx = -1
      } else {
        idx--
      }
    }

    historyIndex.current = idx
    const newText = idx === -1 ? currentDraft.current : items[idx]

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newText },
      selection: { anchor: newText.length },
    })
  }, [])

  // ── Create/destroy CodeMirror editor ───────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const highlightStyle = buildTerminalHighlightStyle()

    // Custom keybindings (highest priority)
    const richInputKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        run: () => { doSubmit(); return true },
      },
      {
        key: 'Shift-Enter',
        run: () => { doSubmit(); return true },
      },
      {
        key: 'Escape',
        run: () => { doCancel(); return true },
      },
      {
        key: 'Ctrl-ArrowUp',
        run: () => { navigateHistory('up'); return true },
      },
      {
        key: 'Ctrl-ArrowDown',
        run: () => { navigateHistory('down'); return true },
      },
    ])

    const extensions = [
      Prec.highest(richInputKeymap),
      lineNumCompartment.current.of([]),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightCompartment.current.of(
        syntaxHighlighting(highlightStyle, { fallback: true })
      ),
      shellLanguage,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      richInputEditorTheme,
      cmPlaceholder('Type a command... (Ctrl+Enter to submit, Esc to cancel)'),
      // Auto-grow: re-measure container when doc changes
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.heightChanged) {
          // Force container to re-layout
          const scroller = containerRef.current?.querySelector('.cm-scroller') as HTMLElement
          if (scroller) {
            // The max-height in theme handles capping at 10 lines
            // The scroller auto-grows with content
          }
        }
      }),
    ]

    const state = EditorState.create({
      doc: '',
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Focus editor when becoming visible ─────────────────────────────────────

  useEffect(() => {
    if (visible && viewRef.current) {
      // Delay to ensure the container is rendered and sized
      requestAnimationFrame(() => {
        viewRef.current?.focus()
      })
    }
  }, [visible])

  // ── Toggle line numbers ────────────────────────────────────────────────────

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumCompartment.current.reconfigure(
        showLineNumbers ? lineNumbers() : []
      ),
    })
  }, [showLineNumbers])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!visible) return null

  return (
    <div
      style={{
        borderTop: '1px solid var(--border, #333)',
        backgroundColor: 'var(--rich-input-bg, rgba(30,30,30,0.95))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'richInputSlideUp 0.15s ease-out',
      }}
    >
      {/* Toolbar row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 8px',
          borderBottom: '1px solid var(--border, #333)',
          backgroundColor: 'var(--rich-input-toolbar-bg, rgba(40,40,40,0.9))',
          minHeight: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontFamily: 'var(--font-ui, sans-serif)',
            color: 'var(--text-muted, #888)',
            userSelect: 'none',
          }}
        >
          <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
            Multi-line Input
          </span>
          <button
            onClick={() => setShowLineNumbers((v) => !v)}
            title="Toggle line numbers"
            style={{
              background: 'none',
              border: showLineNumbers
                ? '1px solid var(--accent, #58a6ff)'
                : '1px solid transparent',
              borderRadius: 3,
              color: showLineNumbers
                ? 'var(--accent, #58a6ff)'
                : 'var(--text-faint, #666)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '1px 5px',
              fontFamily: 'var(--font-ui, sans-serif)',
            }}
          >
            #
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            fontFamily: 'var(--font-ui, sans-serif)',
            color: 'var(--text-faint, #666)',
            userSelect: 'none',
          }}
        >
          <span>Ctrl+Up/Down: history</span>
          <span style={{ color: 'var(--border, #444)' }}>|</span>
          <span>Esc: cancel</span>
          <button
            onClick={doSubmit}
            title="Submit (Ctrl+Enter)"
            style={{
              background: 'var(--accent, #58a6ff)',
              border: 'none',
              borderRadius: 3,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 10px',
              fontFamily: 'var(--font-ui, sans-serif)',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            Submit
          </button>
        </div>
      </div>

      {/* CodeMirror container */}
      <div
        ref={containerRef}
        style={{
          overflow: 'hidden',
          minHeight: 'calc(1.5em + 8px)',
        }}
      />

      {/* Slide-up animation keyframes */}
      <style>{`
        @keyframes richInputSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
})
