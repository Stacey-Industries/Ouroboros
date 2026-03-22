import type { Extension } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

interface HighlightPalette {
  keyword: string;
  comment: string;
  string: string;
  number: string;
  function: string;
  type: string;
  variable: string;
  property: string;
  operator: string;
  punctuation: string;
  namespace: string;
  meta: string;
  tag: string;
  attributeName: string;
  attributeValue: string;
  heading: string;
  link: string;
  url: string;
  typeFontStyle?: 'italic';
}

function createHighlightStyle(palette: HighlightPalette): HighlightStyle {
  const typeStyle = palette.typeFontStyle ? { fontStyle: palette.typeFontStyle } : {};

  return HighlightStyle.define([
    { tag: tags.keyword, color: palette.keyword, fontWeight: 'bold' },
    { tag: tags.controlKeyword, color: palette.keyword, fontWeight: 'bold' },
    { tag: tags.definitionKeyword, color: palette.keyword, fontWeight: 'bold' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: palette.comment, fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: palette.string },
    { tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null], color: palette.number },
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: palette.function },
    { tag: tags.definition(tags.function(tags.name)), color: palette.function },
    { tag: [tags.typeName, tags.className], color: palette.type, ...typeStyle },
    { tag: tags.typeOperator, color: palette.operator },
    { tag: [tags.variableName, tags.name], color: palette.variable },
    { tag: tags.definition(tags.variableName), color: palette.variable },
    { tag: tags.propertyName, color: palette.property },
    { tag: tags.operator, color: palette.operator },
    { tag: [tags.punctuation, tags.bracket, tags.angleBracket], color: palette.punctuation },
    { tag: tags.namespace, color: palette.namespace },
    { tag: tags.meta, color: palette.meta },
    { tag: tags.tagName, color: palette.tag },
    { tag: tags.attributeName, color: palette.attributeName },
    { tag: tags.attributeValue, color: palette.attributeValue },
    { tag: tags.heading, color: palette.heading, fontWeight: 'bold' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.link, color: palette.link, textDecoration: 'underline' },
    { tag: tags.url, color: palette.url },
  ]);
}

const HIGHLIGHT_STYLES = {
  retro: createHighlightStyle({
    keyword: '#F92672',
    comment: '#75715E',
    string: '#E6DB74',
    number: '#AE81FF',
    function: '#A6E22E',
    type: '#66D9EF',
    variable: '#F8F8F2',
    property: '#A6E22E',
    operator: '#F92672',
    punctuation: '#F8F8F2',
    namespace: '#66D9EF',
    meta: '#75715E',
    tag: '#F92672',
    attributeName: '#A6E22E',
    attributeValue: '#E6DB74',
    heading: '#F92672',
    link: '#66D9EF',
    url: '#E6DB74',
    typeFontStyle: 'italic',
  }),
  modern: createHighlightStyle({
    keyword: '#FF7B72',
    comment: '#8B949E',
    string: '#A5D6FF',
    number: '#79C0FF',
    function: '#D2A8FF',
    type: '#FFA657',
    variable: '#E6EDF3',
    property: '#79C0FF',
    operator: '#FF7B72',
    punctuation: '#E6EDF3',
    namespace: '#FFA657',
    meta: '#8B949E',
    tag: '#7EE787',
    attributeName: '#79C0FF',
    attributeValue: '#A5D6FF',
    heading: '#FF7B72',
    link: '#A5D6FF',
    url: '#A5D6FF',
  }),
  warp: createHighlightStyle({
    keyword: '#FF79C6',
    comment: '#6272A4',
    string: '#F1FA8C',
    number: '#BD93F9',
    function: '#50FA7B',
    type: '#8BE9FD',
    variable: '#F8F8F2',
    property: '#66D9EF',
    operator: '#FF79C6',
    punctuation: '#F8F8F2',
    namespace: '#8BE9FD',
    meta: '#6272A4',
    tag: '#FF79C6',
    attributeName: '#50FA7B',
    attributeValue: '#F1FA8C',
    heading: '#BD93F9',
    link: '#8BE9FD',
    url: '#F1FA8C',
    typeFontStyle: 'italic',
  }),
  cursor: createHighlightStyle({
    keyword: '#BB9AF7',
    comment: '#565F89',
    string: '#9ECE6A',
    number: '#FF9E64',
    function: '#7AA2F7',
    type: '#2AC3DE',
    variable: '#C0CAF5',
    property: '#73DACA',
    operator: '#89DDFF',
    punctuation: '#C0CAF5',
    namespace: '#2AC3DE',
    meta: '#565F89',
    tag: '#F7768E',
    attributeName: '#BB9AF7',
    attributeValue: '#9ECE6A',
    heading: '#7AA2F7',
    link: '#73DACA',
    url: '#9ECE6A',
  }),
  kiro: createHighlightStyle({
    keyword: '#CBA6F7',
    comment: '#6C7086',
    string: '#A6E3A1',
    number: '#FAB387',
    function: '#89B4FA',
    type: '#F38BA8',
    variable: '#CDD6F4',
    property: '#89DCEB',
    operator: '#89DCEB',
    punctuation: '#CDD6F4',
    namespace: '#F38BA8',
    meta: '#6C7086',
    tag: '#F38BA8',
    attributeName: '#89B4FA',
    attributeValue: '#A6E3A1',
    heading: '#CBA6F7',
    link: '#89DCEB',
    url: '#A6E3A1',
  }),
} satisfies Record<string, HighlightStyle>;

export const editorThemeExtensions: Extension[] = [
  EditorView.theme({
    '&': { height: '100%', fontSize: '0.8125rem' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(88, 166, 255, 0.2)' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(88, 166, 255, 0.15)' },
    '.cm-activeLine': { backgroundColor: 'rgba(88, 166, 255, 0.06)' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-panel)',
      color: 'var(--text-faint)',
      borderRight: '1px solid var(--border-muted)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(88, 166, 255, 0.08)' },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--surface-panel)',
      border: '1px solid var(--border-semantic)',
      color: 'var(--text-muted)',
      padding: '0 4px',
      borderRadius: '3px',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(229, 192, 123, 0.3)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(229, 192, 123, 0.5)' },
    '.cm-panels': { backgroundColor: 'var(--surface-panel)', color: 'var(--text)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border-semantic)' },
    '.cm-panel.cm-search': { padding: '4px 8px' },
    '.cm-panel.cm-search input': {
      backgroundColor: 'var(--surface-base)',
      color: 'var(--text)',
      border: '1px solid var(--border-semantic)',
      borderRadius: '3px',
      padding: '2px 6px',
      fontSize: '0.8125rem',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-panel.cm-search button': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      padding: '2px 8px',
      cursor: 'pointer',
      fontSize: '0.75rem',
    },
    '.cm-panel.cm-search button:hover': { backgroundColor: 'var(--border)', color: 'var(--text)' },
    '.cm-panel.cm-search label': { color: 'var(--text-muted)', fontSize: '0.75rem' },
    '.cm-tooltip': { backgroundColor: 'var(--surface-panel)', border: '1px solid var(--border-semantic)', color: 'var(--text)' },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': { backgroundColor: 'rgba(88, 166, 255, 0.15)' },
    },
  }),
  EditorView.theme({
    '&': {
      backgroundColor: 'var(--surface-base)',
      color: 'var(--text)',
    },
  }),
];

export function getHighlightStyle(themeId: string): HighlightStyle {
  return HIGHLIGHT_STYLES[themeId] ?? HIGHLIGHT_STYLES.modern;
}

export function createHighlightExtension(themeId: string): Extension {
  return syntaxHighlighting(getHighlightStyle(themeId), { fallback: true });
}
