/**
 * goalClassifier.ts — Heuristic classifier for goal text.
 *
 * Returns 'code' | 'casual' | 'unknown' to drive packet-mode selection
 * (lean for casual chat, full for code work). Regex-only — no LLM call,
 * no I/O, no allocation hot paths. When in doubt we return 'unknown' and
 * the caller decides the safe default.
 */

export type GoalShape = 'code' | 'casual' | 'unknown';

const CASUAL_LENGTH_THRESHOLD = 80;

const FILE_PATH_PATTERNS: RegExp[] = [
  /\b(?:src|test|tests|lib|app|packages|tools|scripts|docs)\//i,
  /\.[a-z0-9]{1,5}\b/i,
  /[\w/.-]+\.(?:ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|md|json|yml|yaml|toml|css|scss|html)\b/i,
];

const CODE_TOKEN_PATTERNS: RegExp[] = [
  /```/,
  /\bfunction\s+\w+\s*\(/,
  /\bclass\s+\w+/,
  /=>\s*[{(]/,
  /\bimport\s+.+\bfrom\b/,
  /\bexport\s+(?:default|const|function|class)\b/,
  /\bnpm\s+(?:run|install|test)\b/i,
  /\b(?:npx|yarn|pnpm|cargo|pip|go)\s+\w/,
  /\$\s*[a-zA-Z_]/,
  /\berror[: ]/i,
  /\bstack\s*trace\b/i,
  /TypeError|ReferenceError|SyntaxError/,
];

const CODE_INTENT_PATTERNS: RegExp[] = [
  /\b(?:debug|fix|refactor|implement|review|audit|investigate|profile|optimi[sz]e|migrate)\b/i,
  /\b(?:add|remove|update|change|modify|extract|inline|rename)\s+(?:this|the|a|an)\s+\w+/i,
  /\b(?:why|what|how)\s+(?:does|is|are|did)\s+(?:this|the)\b/i,
];

const CASUAL_PATTERNS: RegExp[] = [
  /^(?:hi|hello|hey|yo|sup|howdy|thanks?|thx|ok|okay|cool|nice|got it)\b/i,
  /^(?:how(?:'?s| are) (?:it going|you))/i,
  /^(?:what'?s up|good (?:morning|afternoon|evening|night))/i,
];

function hasAnyMatch(text: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function isCodeShaped(text: string): boolean {
  if (hasAnyMatch(text, FILE_PATH_PATTERNS)) return true;
  if (hasAnyMatch(text, CODE_TOKEN_PATTERNS)) return true;
  return hasAnyMatch(text, CODE_INTENT_PATTERNS);
}

function isCasualShaped(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length <= CASUAL_LENGTH_THRESHOLD && hasAnyMatch(trimmed, CASUAL_PATTERNS)) {
    return true;
  }
  if (trimmed.length <= 40 && !/[\\/.@#$]/.test(trimmed)) return true;
  return false;
}

export function classifyGoal(goal: string | undefined | null): GoalShape {
  if (typeof goal !== 'string') return 'unknown';
  const text = goal.trim();
  if (text.length === 0) return 'casual';
  if (isCodeShaped(text)) return 'code';
  if (isCasualShaped(text)) return 'casual';
  return 'unknown';
}
