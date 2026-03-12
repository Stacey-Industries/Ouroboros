/**
 * templateResolver.ts — Resolves {{variable}} placeholders in agent template prompts.
 */

export interface TemplateContext {
  projectRoot: string | null
  projectName: string
  openFile: string | null
  openFileName: string | null
}

/**
 * Replace {{variable}} placeholders with context values.
 * Unresolved variables (null context) are replaced with empty strings.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{\{projectRoot\}\}/g, ctx.projectRoot ?? '')
    .replace(/\{\{projectName\}\}/g, ctx.projectName)
    .replace(/\{\{openFile\}\}/g, ctx.openFile ?? '')
    .replace(/\{\{openFileName\}\}/g, ctx.openFileName ?? '')
}
