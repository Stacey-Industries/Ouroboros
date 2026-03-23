import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { wast } from '@codemirror/lang-wast';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';

const LANGUAGE_FACTORIES: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  html: () => html(),
  htm: () => html(),
  svelte: () => html(),
  vue: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  sass: () => css(),
  json: () => json(),
  jsonc: () => json(),
  md: () => markdown(),
  mdx: () => markdown(),
  markdown: () => markdown(),
  py: () => python(),
  rs: () => rust(),
  c: () => cpp(),
  h: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  cxx: () => cpp(),
  hpp: () => cpp(),
  cs: () => cpp(),
  java: () => java(),
  kt: () => java(),
  xml: () => xml(),
  svg: () => xml(),
  sql: () => sql(),
  wast: () => wast(),
  wat: () => wast(),
  yaml: () => yaml(),
  yml: () => yaml(),
};

export function getLanguageExtension(filePath: string): Extension | null {
  const extension = filePath.toLowerCase().split('.').pop() ?? '';
  return LANGUAGE_FACTORIES[extension]?.() ?? null;
}

export function createLanguageExtensions(languageExtension: Extension | null): Extension[] {
  return languageExtension ? [languageExtension] : [];
}
