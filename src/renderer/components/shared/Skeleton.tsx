/**
 * Skeleton.tsx — Reusable loading skeleton components with shimmer animation.
 *
 * Uses CSS custom properties for theme compatibility:
 *   - var(--surface-raised) for the skeleton base color
 *   - var(--surface-panel) for the shimmer highlight
 */

import React, { memo } from 'react';

// ── Inject shimmer keyframes once ────────────────────────────────────────────

if (typeof document !== 'undefined') {
  const styleId = '__skeleton-shimmer__';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;
    document.head.appendChild(style);
  }
}

// ── Shared shimmer style ────────────────────────────────────────────────────

function shimmerStyle(width?: string | number, height?: string | number): React.CSSProperties {
  return {
    width: width ?? '100%',
    height: height ?? '12px',
    borderRadius: '4px',
    background: `linear-gradient(
      90deg,
      var(--surface-raised) 25%,
      var(--surface-panel) 50%,
      var(--surface-raised) 75%
    )`,
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.8s ease-in-out infinite',
  };
}

// ── SkeletonLine ─────────────────────────────────────────────────────────────

export interface SkeletonLineProps {
  /** Width — CSS value or number (px). Defaults to '100%'. */
  width?: string | number;
  /** Height — CSS value or number (px). Defaults to 12. */
  height?: string | number;
  /** Extra inline styles */
  style?: React.CSSProperties;
}

/**
 * A single animated shimmer bar.
 */
export const SkeletonLine = memo(function SkeletonLine({
  width,
  height,
  style,
}: SkeletonLineProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        ...shimmerStyle(width, height),
        ...style,
      }}
    />
  );
});

// ── SkeletonBlock ─────────────────────────────────────────────────────────────

export interface SkeletonBlockProps {
  /** Number of skeleton lines to render. Defaults to 4. */
  lines?: number;
  /** Gap between lines in px. Defaults to 8. */
  gap?: number;
  /** Array of widths (one per line). Cycles if shorter than `lines`. */
  widths?: Array<string | number>;
  /** Height per line. Defaults to 12. */
  lineHeight?: string | number;
  /** Extra inline styles on the container */
  style?: React.CSSProperties;
}

/**
 * A group of SkeletonLines that mimics a block of content.
 */
export const SkeletonBlock = memo(function SkeletonBlock({
  lines = 4,
  gap = 8,
  widths,
  lineHeight,
  style,
}: SkeletonBlockProps): React.ReactElement {
  const defaultWidths = ['100%', '90%', '75%', '85%', '60%', '95%', '70%', '80%'];
  const resolvedWidths = widths ?? defaultWidths;

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${gap}px`,
        ...style,
      }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine
          key={i}
          width={resolvedWidths[i % resolvedWidths.length]}
          height={lineHeight}
        />
      ))}
    </div>
  );
});

// ── FileTreeSkeleton ──────────────────────────────────────────────────────────

/**
 * Skeleton that mimics a file tree with indented items.
 */
export const FileTreeSkeleton = memo(function FileTreeSkeleton(): React.ReactElement {
  // Varying widths and indentation to mimic a tree
  const items = [
    { indent: 0, width: '70%' },
    { indent: 16, width: '55%' },
    { indent: 16, width: '60%' },
    { indent: 16, width: '45%' },
    { indent: 0, width: '65%' },
    { indent: 16, width: '50%' },
    { indent: 32, width: '40%' },
    { indent: 32, width: '55%' },
    { indent: 16, width: '60%' },
    { indent: 0, width: '50%' },
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 12px',
      }}
    >
      {items.map((item, i) => (
        <SkeletonLine
          key={i}
          width={item.width}
          height={10}
          style={{
            marginLeft: `${item.indent}px`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
});

// ── CodeSkeleton ──────────────────────────────────────────────────────────────

const CODE_SKELETON_LINE_WIDTHS = [
  '80%',
  '65%',
  '90%',
  '45%',
  '75%',
  '55%',
  '85%',
  '40%',
  '70%',
  '60%',
  '50%',
  '72%',
];

function CodeSkeletonGutter({ lineCount }: { lineCount: number }): React.ReactElement {
  return (
    <div
      style={{
        flexShrink: 0,
        width: '44px',
        paddingTop: '16px',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '9px',
        paddingRight: '12px',
      }}
    >
      {Array.from({ length: lineCount }, (_, i) => (
        <SkeletonLine
          key={i}
          width={18}
          height={8}
          style={{ animationDelay: `${i * 0.06}s`, opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

function CodeSkeletonContent({
  lineWidths,
}: {
  lineWidths: Array<string | number>;
}): React.ReactElement {
  return (
    <div
      style={{
        flex: 1,
        padding: '16px 16px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
      }}
    >
      {lineWidths.map((width, i) => (
        <SkeletonLine key={i} width={width} height={8} style={{ animationDelay: `${i * 0.06}s` }} />
      ))}
    </div>
  );
}

/**
 * Skeleton that mimics a code editor with gutter and code lines.
 */
export const CodeSkeleton = memo(function CodeSkeleton(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        height: '100%',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <CodeSkeletonGutter lineCount={CODE_SKELETON_LINE_WIDTHS.length} />
      <CodeSkeletonContent lineWidths={CODE_SKELETON_LINE_WIDTHS} />
    </div>
  );
});

// ── AgentCardSkeleton ─────────────────────────────────────────────────────────

/**
 * Skeleton that mimics an agent card.
 */
export const AgentCardSkeleton = memo(function AgentCardSkeleton(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: '12px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SkeletonLine width={20} height={20} style={{ borderRadius: '50%' }} />
        <SkeletonLine width="60%" height={12} />
      </div>
      {/* Body lines */}
      <SkeletonLine width="90%" height={8} style={{ animationDelay: '0.1s' }} />
      <SkeletonLine width="70%" height={8} style={{ animationDelay: '0.2s' }} />
    </div>
  );
});
