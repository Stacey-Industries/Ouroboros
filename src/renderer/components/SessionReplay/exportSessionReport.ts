import type { AgentSession } from '../AgentMonitor/types';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function totalDuration(session: AgentSession): number {
  if (session.completedAt) return session.completedAt - session.startedAt;
  return Date.now() - session.startedAt;
}

export function exportSessionReport(session: AgentSession): string {
  const lines: string[] = [];
  lines.push('# Agent Session Report');
  lines.push('');
  lines.push(`**Task**: ${session.taskLabel}`);
  lines.push(`**Date**: ${formatDate(session.startedAt)}`);
  lines.push(`**Duration**: ${formatDuration(totalDuration(session))}`);
  lines.push(`**Status**: ${session.status}`);
  if (session.model) lines.push(`**Model**: ${session.model}`);
  lines.push(`**Tokens**: ${session.inputTokens.toLocaleString()} in / ${session.outputTokens.toLocaleString()} out`);
  lines.push('');
  lines.push('## Steps');
  lines.push('');

  for (const [i, step] of session.toolCalls.entries()) {
    const dur = step.duration !== undefined ? ` (${formatDuration(step.duration)})` : '';
    const status = step.status === 'error' ? ' **ERROR**' : '';
    lines.push(`### ${i + 1}. ${step.toolName}${dur}${status}`);
    if (step.input) {
      lines.push('');
      lines.push('```');
      lines.push(step.input);
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Exported from Ouroboros IDE on ${formatDate(Date.now())}*`);

  return lines.join('\n');
}
