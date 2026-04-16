/**
 * ptyArgEscape.ts — PowerShell argument escaping utility.
 * Extracted from pty.ts to keep that file under the 300-line ESLint limit.
 */

/**
 * Escape a single argument for safe use inside a PowerShell command string.
 * Handles all PowerShell metacharacters — not just backticks — to prevent
 * command injection via crafted CLI arguments (e.g. appendSystemPrompt).
 *
 * Security: wraps every argument in single-quotes and doubles any embedded
 * single-quotes, which is the only safe quoting strategy for PowerShell.
 * Single-quoted strings in PowerShell are literal — no variable expansion,
 * no backtick escapes, no subexpression evaluation.
 */
export function escapePowerShellArg(arg: string): string {
  // In PowerShell single-quoted strings, the only special character is
  // the single-quote itself, which is escaped by doubling it.
  return `'${arg.replace(/'/g, "''")}'`;
}
