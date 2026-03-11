export interface Theme {
  id: string;
  name: string;
  fontFamily: {
    mono: string;  // terminal + code
    ui: string;    // UI labels, buttons
  };
  colors: {
    bg: string;           // main background
    bgSecondary: string;  // panel backgrounds
    bgTertiary: string;   // hover/active states
    border: string;
    borderMuted: string;  // softer border for dividers
    text: string;         // primary text
    textSecondary: string;
    textMuted: string;
    textFaint: string;    // even lighter than textMuted (placeholders, timestamps)
    accent: string;       // primary accent
    accentHover: string;
    accentMuted: string;  // dimmed accent for subtle highlights
    success: string;
    warning: string;
    error: string;
    purple: string;       // for tool call badges (Grep, Glob)
    purpleMuted: string;  // dimmed purple
    selection: string;    // text selection background
    focusRing: string;    // focus ring color
    // terminal-specific
    termBg: string;
    termFg: string;
    termCursor: string;
    termSelection: string;
  };
  effects?: {
    scanlines?: boolean;  // retro theme only
    glowText?: boolean;
  };
  /** Optional CSS gradient string applied as background-image on the root container */
  backgroundGradient?: string;
}
