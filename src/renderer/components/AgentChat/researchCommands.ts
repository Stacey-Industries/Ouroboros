/**
 * researchCommands.ts — Slash-command helpers for the research pipeline (Wave 25 Phase C).
 *
 * Provides three pure utilities:
 *   parseResearchCommand — parse the draft text into a command + topic pair
 *   runResearchAndPin   — invoke research IPC, pin the resulting artifact
 *   buildFollowupPrompt — build the user message sent after the research step
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResearchCommandId =
  | 'research'
  | 'spec-with-research'
  | 'implement-with-research';

export interface ParsedResearchCommand {
  cmd: ResearchCommandId;
  topic: string;
}

export interface RunResearchResult {
  success: boolean;
  artifactId?: string;
  error?: string;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

const RESEARCH_CMD_RE =
  /^\/(research|spec-with-research|implement-with-research)\s+([\s\S]+)/i;

/**
 * Parse a composer draft into a research command + topic.
 * Returns null when the draft does not match any research slash command.
 */
export function parseResearchCommand(input: string): ParsedResearchCommand | null {
  const match = RESEARCH_CMD_RE.exec(input.trimStart());
  if (!match) return null;
  const rawCmd = match[1].toLowerCase() as ResearchCommandId;
  const topic = match[2].trim();
  if (!topic) return null;
  return { cmd: rawCmd, topic };
}

// ─── Pin ─────────────────────────────────────────────────────────────────────

/**
 * Invoke the research IPC and pin the resulting artifact to the session.
 * Always resolves — never throws.
 */
export async function runResearchAndPin(params: {
  sessionId: string;
  topic: string;
}): Promise<RunResearchResult> {
  const { sessionId, topic } = params;

  let result: Awaited<ReturnType<typeof window.electronAPI.research.invoke>>;
  try {
    result = await window.electronAPI.research.invoke({ topic });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!result.success || !result.artifact) {
    return { success: false, error: result.error ?? 'Research returned no artifact' };
  }

  const artifact = result.artifact;

  try {
    await window.electronAPI.pinnedContext.add(sessionId, {
      type: 'research-artifact',
      source: `research://${artifact.correlationId}`,
      title: artifact.topic,
      content: artifact.summary,
      tokens: Math.ceil(artifact.summary.length / 4),
    });
  } catch (err) {
    // Pin failure is non-fatal — artifact was retrieved successfully
    return {
      success: true,
      artifactId: artifact.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { success: true, artifactId: artifact.id };
}

// ─── Follow-up prompt ────────────────────────────────────────────────────────

/**
 * Build the follow-up user message to send after research + pin.
 * Returns an empty string for plain /research (no follow-up needed).
 */
export function buildFollowupPrompt(cmd: ResearchCommandId, topic: string): string {
  if (cmd === 'spec-with-research') return `Generate a spec for: ${topic}`;
  if (cmd === 'implement-with-research') return `Implement: ${topic}`;
  return '';
}
