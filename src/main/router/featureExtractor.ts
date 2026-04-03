/**
 * featureExtractor.ts — Extracts numeric features from a prompt for model routing.
 *
 * Produces a Record<FeatureName, number> matching the canonical FEATURE_NAMES order
 * defined in routerTypes.ts. Used as input to the ML classifier (Layer 2).
 *
 * Pure function — no side effects, no I/O.
 */

import { type FeatureName } from './routerTypes';

/* ── Word / phrase lists ──────────────────────────────────────────────── */

const JUDGMENT_WORDS = [
  'think', 'should', 'recommend', 'evaluate', 'opinion',
  'approach', 'better', 'improve', 'review', 'assess',
];

const PLANNING_WORDS = [
  'plan', 'architect', 'design', 'spec', 'scope',
  'strategy', 'roadmap', 'phase',
];

const IMPLEMENTATION_WORDS = [
  'add', 'fix', 'change', 'implement', 'create',
  'build', 'update', 'remove', 'delete', 'refactor', 'move',
];

const LOOKUP_PHRASES = [
  'what is', 'where is', 'show me', 'how does', 'explain', 'what does',
];

const AMBIGUITY_WORDS = [
  ' or ', 'maybe', 'not sure', 'might', 'could', 'alternative', 'either',
];

const SCOPE_WORDS = [
  'entire', 'whole', ' all ', 'across', 'everything', 'system', 'codebase',
];

/* ── Regex helpers ────────────────────────────────────────────────────── */

const FILE_PATH_RE = /(?:[a-zA-Z]:\\[\w\\./]+|src\\[\w\\./]+|[\w./]+\.(?:ts|tsx|js|json|md|css))/g;
const SENTENCE_SPLIT_RE = /[.!?](?:\s|$)/g;

/* ── Feature sub-extractors ───────────────────────────────────────────── */

function countMatches(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
}

function extractPathFeatures(prompt: string): { containsFilePath: number; filePathCount: number } {
  const matches = prompt.match(FILE_PATH_RE) ?? [];
  return {
    containsFilePath: matches.length > 0 ? 1 : 0,
    filePathCount: matches.length,
  };
}

function bucketPrevLength(len: number): number {
  if (len === 0) return 0;
  if (len < 200) return 1;
  if (len <= 500) return 2;
  return 3;
}

function isPlan(msg: string): number {
  if (msg.length <= 500) return 0;
  const hasStructure =
    msg.includes('|') ||
    msg.includes('##') ||
    /\d+\./.test(msg) ||
    /^- /m.test(msg);
  return hasStructure ? 1 : 0;
}

function extractPrevFeatures(prev?: string): {
  prevMessageIsAssistant: number;
  prevAssistantEndsWithQuestion: number;
  prevAssistantLength: number;
  prevAssistantIsPlan: number;
} {
  if (!prev || prev.length === 0) {
    return {
      prevMessageIsAssistant: 0,
      prevAssistantEndsWithQuestion: 0,
      prevAssistantLength: 0,
      prevAssistantIsPlan: 0,
    };
  }
  return {
    prevMessageIsAssistant: 1,
    prevAssistantEndsWithQuestion: prev.trimEnd().endsWith('?') ? 1 : 0,
    prevAssistantLength: bucketPrevLength(prev.length),
    prevAssistantIsPlan: isPlan(prev),
  };
}

/* ── Prompt feature helpers ───────────────────────────────────────────── */

interface PromptFeatures {
  promptCharLength: number;
  wordCount: number;
  questionMarkCount: number;
  sentenceCount: number;
  containsCodeBlock: number;
  containsFilePath: number;
  filePathCount: number;
  judgmentWordCount: number;
  planningWordCount: number;
  implementationWordCount: number;
  lookupWordCount: number;
  ambiguityWordCount: number;
  scopeWordCount: number;
  isPastedOnly: number;
  slashCommandPresent: number;
}

function extractPromptFeatures(prompt: string): PromptFeatures {
  const lower = prompt.toLowerCase();
  const words = prompt.trim() === '' ? [] : prompt.trim().split(/\s+/);
  const sentenceMatches = prompt.match(SENTENCE_SPLIT_RE) ?? [];
  const pathFeatures = extractPathFeatures(prompt);
  return {
    promptCharLength: prompt.length,
    wordCount: words.length,
    questionMarkCount: (prompt.match(/\?/g) ?? []).length,
    sentenceCount: Math.max(1, sentenceMatches.length),
    containsCodeBlock: prompt.includes('```') ? 1 : 0,
    containsFilePath: pathFeatures.containsFilePath,
    filePathCount: pathFeatures.filePathCount,
    judgmentWordCount: countMatches(lower, JUDGMENT_WORDS),
    planningWordCount: countMatches(lower, PLANNING_WORDS),
    implementationWordCount: countMatches(lower, IMPLEMENTATION_WORDS),
    lookupWordCount: countMatches(lower, LOOKUP_PHRASES),
    ambiguityWordCount: countMatches(lower, AMBIGUITY_WORDS),
    scopeWordCount: countMatches(lower, SCOPE_WORDS),
    isPastedOnly: /^\[Pasted text #\d+/.test(prompt) ? 1 : 0,
    slashCommandPresent: prompt.startsWith('/') ? 1 : 0,
  };
}

/* ── Main extractor ───────────────────────────────────────────────────── */

/**
 * Extracts numeric features from a prompt (and optional preceding assistant
 * message) for use by the ML classifier.
 */
export function extractFeatures(
  prompt: string,
  previousAssistantMessage?: string,
): Record<FeatureName, number> {
  const p = extractPromptFeatures(prompt);
  const v = extractPrevFeatures(previousAssistantMessage);
  return {
    promptCharLength: p.promptCharLength,
    wordCount: p.wordCount,
    questionMarkCount: p.questionMarkCount,
    sentenceCount: p.sentenceCount,
    containsCodeBlock: p.containsCodeBlock,
    containsFilePath: p.containsFilePath,
    filePathCount: p.filePathCount,
    judgmentWordCount: p.judgmentWordCount,
    planningWordCount: p.planningWordCount,
    implementationWordCount: p.implementationWordCount,
    lookupWordCount: p.lookupWordCount,
    ambiguityWordCount: p.ambiguityWordCount,
    scopeWordCount: p.scopeWordCount,
    prevMessageIsAssistant: v.prevMessageIsAssistant,
    prevAssistantEndsWithQuestion: v.prevAssistantEndsWithQuestion,
    prevAssistantLength: v.prevAssistantLength,
    prevAssistantIsPlan: v.prevAssistantIsPlan,
    isPastedOnly: p.isPastedOnly,
    slashCommandPresent: p.slashCommandPresent,
  };
}
