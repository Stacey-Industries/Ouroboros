import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import React from 'react';

const shellTokenMatchers = [
  { pattern: /"([^"\\]|\\.)*"/, token: 'string' },
  { pattern: /'[^']*'/, token: 'string' },
  { pattern: /`[^`]*`/, token: 'string' },
  { pattern: /\$\{[^}]*\}/, token: 'variableName' },
  { pattern: /\$[A-Za-z_][A-Za-z0-9_]*/, token: 'variableName' },
  { pattern: /\$[0-9#?@!$*-]/, token: 'variableName' },
  { pattern: /\b\d+\b/, token: 'number' },
  { pattern: /[|&;><]+/, token: 'operator' },
  {
    pattern:
      /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|source|alias|unalias|local|readonly|declare|typeset|set|unset|shift|trap|break|continue|select|until|coproc|time)\b/,
    token: 'keyword',
  },
  {
    pattern:
      /\b(cd|ls|cp|mv|rm|mkdir|rmdir|cat|echo|grep|sed|awk|find|sort|uniq|wc|head|tail|chmod|chown|curl|wget|git|npm|npx|node|python|pip|docker|ssh|scp|tar|zip|unzip|make|cmake|cargo|go|rustc|gcc|clang|claude)\b/,
    token: 'atom',
  },
  { pattern: /-{1,2}[A-Za-z0-9_-]+/, token: 'attributeName' },
] as const;

export const shellLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    for (const matcher of shellTokenMatchers) {
      if (stream.match(matcher.pattern)) return matcher.token;
    }
    stream.next();
    return null;
  },
  startState() {
    return {};
  },
});

export const richInputHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--rich-input-keyword, #ff79c6)' },
  { tag: tags.comment, color: 'var(--rich-input-comment, #6272a4)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--rich-input-string, #f1fa8c)' },
  { tag: tags.variableName, color: 'var(--rich-input-variable, #8be9fd)' },
  { tag: tags.number, color: 'var(--rich-input-number, #bd93f9)' },
  { tag: tags.operator, color: 'var(--rich-input-operator, #ff79c6)' },
  { tag: tags.atom, color: 'var(--rich-input-command, #50fa7b)' },
  { tag: tags.attributeName, color: 'var(--rich-input-flag, #ffb86c)' },
]);

export const richInputHighlightExtension = syntaxHighlighting(richInputHighlightStyle, {
  fallback: true,
});

export const richInputEditorTheme = EditorView.theme({
  '&': {
    fontSize: 'var(--term-font-size, 13px)',
    backgroundColor: 'transparent',
    color: 'var(--term-fg, var(--text, #f8f8f2))',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: '1.5',
    overflow: 'auto',
    maxHeight: 'calc(1.5em * 10 + 16px)',
  },
  '.cm-content': {
    caretColor: 'var(--term-cursor, var(--accent, #f8f8f0))',
    padding: '8px 4px',
    minHeight: '4em',
  },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--term-cursor, var(--accent, #f8f8f0))' },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--term-selection, rgba(88,166,255,0.25))',
  },
  '.cm-selectionBackground': { backgroundColor: 'var(--term-selection, rgba(88,166,255,0.15))' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-semantic-faint, #555)',
    borderRight: '1px solid var(--border, #333)',
    minWidth: '2.5em',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-scroller::-webkit-scrollbar': { width: '6px' },
  '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--border, #444)',
    borderRadius: '3px',
  },
});

export const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 8px',
  borderBottom: '1px solid var(--border, #333)',
  backgroundColor: 'var(--rich-input-toolbar-bg, rgba(40,40,40,0.9))',
  minHeight: 24,
};

export const toolbarPrimaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  fontFamily: 'var(--font-ui, sans-serif)',
  userSelect: 'none',
};

export const toolbarSecondaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 10,
  fontFamily: 'var(--font-ui, sans-serif)',
  userSelect: 'none',
};

export const toolbarTitleStyle: React.CSSProperties = { fontWeight: 600, letterSpacing: '0.02em' };

export const dividerStyle: React.CSSProperties = { color: 'var(--border-default)' };

export const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  borderTop: '2px solid var(--interactive-accent)',
  backgroundColor: 'var(--rich-input-bg, rgba(30,30,30,0.97))',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'richInputSlideUp 0.15s ease-out',
  minHeight: '120px',
  maxHeight: '50%',
};

export const editorHostStyle: React.CSSProperties = {
  overflow: 'auto',
  minHeight: '6em',
  flex: '1 1 auto',
};

export const richInputAnimationCss =
  '@keyframes richInputSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }';

export function getLineNumberButtonStyle(showLineNumbers: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: showLineNumbers ? '1px solid var(--interactive-accent)' : '1px solid transparent',
    borderRadius: 3,
    color: showLineNumbers ? 'var(--interactive-accent)' : 'var(--text-semantic-faint, #666)',
    cursor: 'pointer',
    fontSize: 10,
    padding: '1px 5px',
    fontFamily: 'var(--font-ui, sans-serif)',
  };
}

export const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  color: 'var(--text-semantic-muted, #a0a0a0)',
  cursor: 'pointer',
  fontSize: 10,
  padding: '2px 8px',
  fontFamily: 'var(--font-ui, sans-serif)',
};

export const submitBtnStyle: React.CSSProperties = {
  background: 'var(--interactive-accent)',
  border: 'none',
  borderRadius: 3,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 10,
  padding: '2px 10px',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontWeight: 600,
  letterSpacing: '0.02em',
};

export function createHighlightCompartment(): Compartment {
  return new Compartment();
}
