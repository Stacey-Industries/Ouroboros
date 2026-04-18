/**
 * index.ts — i18n runtime.
 * Wave 38 Phase A — dot-path key lookup + {arg} interpolation, no external deps.
 */
import { EN_STRINGS } from './en';
import { ES_STRINGS } from './es';

export type LocaleCode = 'en' | 'es';

export { EN_STRINGS, ES_STRINGS };

type StringTree = { [key: string]: string | StringTree };

const LOCALES: Record<LocaleCode, StringTree> = {
  en: EN_STRINGS as StringTree,
  es: ES_STRINGS as StringTree,
};

let activeLocale: LocaleCode = 'en';

export function setLocale(code: LocaleCode): void {
  activeLocale = code;
}

export function getLocale(): LocaleCode {
  return activeLocale;
}

function resolvePath(tree: StringTree, segments: string[]): string | undefined {
  let node: string | StringTree = tree;
  for (const seg of segments) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[seg];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(raw: string, args: Record<string, string | number>): string {
  return raw.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = args[key as keyof typeof args];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

export function t(key: string, args?: Record<string, string | number>): string {
  const segments = key.split('.');
  const primary = resolvePath(LOCALES[activeLocale], segments);
  const fallback = activeLocale !== 'en' ? resolvePath(LOCALES.en, segments) : undefined;
  const raw = primary ?? fallback ?? key;
  return args ? interpolate(raw, args) : raw;
}
