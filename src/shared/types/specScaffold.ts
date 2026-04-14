/**
 * shared/types/specScaffold.ts
 *
 * `/spec` slash command scaffold types — Wave 6 (#108).
 * Creates `.ouroboros/specs/<slug>/{requirements,design,tasks}.md` from
 * templates and opens the files in the editor.
 */

export interface SpecScaffoldRequest {
  projectRoot: string;
  /** Raw feature name from composer — will be slugified server-side. */
  featureName: string;
}

export interface SpecScaffoldResult {
  success: boolean;
  /** Absolute path of .ouroboros/specs/<slug>/ on success. */
  specDir?: string;
  /** Absolute paths of the three scaffolded files, in display order. */
  files?: string[];
  /** Slugified feature identifier used for the folder name. */
  slug?: string;
  error?: string;
  /** True when the slug already existed and no files were written. */
  collision?: boolean;
}
