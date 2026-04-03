export type CommandCategory = 'app' | 'file' | 'view' | 'terminal' | 'git' | 'extension';

export interface Command {
  id: string;
  label: string;
  /**
   * Logical grouping for display headers in flat list view.
   * Use the standard CommandCategory values for built-ins; extension commands
   * should use 'extension'.
   */
  category?: CommandCategory | string;
  shortcut?: string;
  icon?: string;
  productIconId?: string;
  action: () => void | Promise<void>;
  when?: () => boolean;
  /**
   * If set, selecting this command navigates into a submenu showing these
   * children instead of executing an action directly.
   */
  children?: Command[];
}

export interface CommandMatch {
  command: Command;
  /** Indices of matched characters in the label (for highlight rendering) */
  matchIndices: number[];
  score: number;
}
