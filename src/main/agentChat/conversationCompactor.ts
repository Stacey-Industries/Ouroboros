/**
 * Conversation compaction — extracts structured summaries from older messages
 * to replace raw content when the conversation exceeds the token budget.
 *
 * This is a synchronous, inline approach (no LLM call). It greps message
 * content for file paths, error indicators, and tool names, then formats
 * a structured summary that preserves continuity for the model.
 */

export interface CompactionSummary {
  compactionCount: number;
  planState: string;
  keyDecisions: string[];
  filesModified: string[];
  errorsResolved: string[];
  criticalContext: string;
  turnsSummarized: number;
  originalTokenCount: number;
}

/** Trigger compaction when history exceeds 70% of budget. */
export const COMPACTION_THRESHOLD = 0.7;

/** Always keep the last 4 message pairs intact (not compacted). */
export const KEEP_RECENT_TURNS = 4;

export function formatCompactionSummary(summary: CompactionSummary): string {
  const lines: string[] = [`[Conversation Compacted — Summary #${summary.compactionCount}]`];

  if (summary.planState) lines.push(`Plan state: ${summary.planState}`);

  if (summary.keyDecisions.length > 0) {
    lines.push('Key decisions:');
    for (const d of summary.keyDecisions) lines.push(`- ${d}`);
  }

  if (summary.filesModified.length > 0) {
    lines.push(`Files modified: ${summary.filesModified.join(', ')}`);
  }

  if (summary.errorsResolved.length > 0) {
    lines.push('Errors resolved:');
    for (const e of summary.errorsResolved) lines.push(`- ${e}`);
  }

  if (summary.criticalContext) lines.push(`Critical context: ${summary.criticalContext}`);

  lines.push(
    `[End Summary — ${summary.turnsSummarized} turns compressed from ~${summary.originalTokenCount} tokens]`,
  );
  return lines.join('\n');
}

const FILE_PATH_RE = /(?:^|\s)((?:\/|[a-zA-Z]:\\|src\/|\.\.?\/)\S+\.\w{1,10})/g;
const ERROR_RE =
  /^.*\b(?:error|Error|ERROR|failed|Failed|FAILED|bug|exception|crash|TypeError|ReferenceError)\b.*$/gm;
const TOOL_RE =
  /\b(Read|Edit|Write|Grep|Glob|Bash|MultiEdit|NotebookEdit|execute_command|read_file|edit_file|write_file|search_files|find_files|create_file)\b/g;

function extractUnique(re: RegExp, text: string, max: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  let m: RegExpExecArray | null = null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const val = m[1] ?? m[0];
    const trimmed = val.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      results.push(trimmed);
      if (results.length >= max) break;
    }
  }
  return results;
}

export function buildInlineSummary(
  messagesToDrop: Array<{ role: string; content: string }>,
  previousCompactionCount: number,
  estimatedTokens: number,
): string {
  const userCount = messagesToDrop.filter((m) => m.role === 'user').length;
  const assistantCount = messagesToDrop.filter((m) => m.role === 'assistant').length;
  const allText = messagesToDrop.map((m) => m.content).join('\n');

  const filePaths = extractUnique(FILE_PATH_RE, allText, 20);
  const rawErrors = extractUnique(ERROR_RE, allText, 10).map((l) => l.slice(0, 120));
  const errorLines =
    rawErrors.length <= 5
      ? rawErrors
      : [...rawErrors.slice(0, 5), `...and ${rawErrors.length - 5} more`];
  const tools = extractUnique(TOOL_RE, allText, 15);

  const summary: CompactionSummary = {
    compactionCount: previousCompactionCount + 1,
    planState: `${userCount} user + ${assistantCount} assistant messages compacted`,
    keyDecisions: [],
    filesModified: filePaths,
    errorsResolved: errorLines,
    criticalContext: tools.length > 0 ? `Tools used: ${tools.join(', ')}` : '',
    turnsSummarized: userCount + assistantCount,
    originalTokenCount: estimatedTokens,
  };

  return formatCompactionSummary(summary);
}
