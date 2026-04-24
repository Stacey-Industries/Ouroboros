/**
 * fileTypeIcons-extra.tsx — Additional SVG icon components for file types.
 *
 * Split from fileTypeIcons.tsx to satisfy the max-lines ESLint limit.
 * Each icon component renders a 16x16 inline SVG.
 */

import React from 'react';

const S = { flexShrink: 0 } as const;

/** Shell terminal icon */
export function ShIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill={color}
        fillOpacity="0.1"
        stroke={color}
        strokeWidth="1"
      />
      <path
        d="M4 6.5l2.5 2-2.5 2"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="8" y1="10.5" x2="12" y2="10.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Image mountain icon */
export function ImgIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill={color}
        fillOpacity="0.1"
        stroke={color}
        strokeWidth="1"
      />
      <path d="M2 12l3.5-5 3 3.5 2-2.5 3.5 4z" fill={color} fillOpacity="0.6" stroke="none" />
      <circle cx="12" cy="5.5" r="1.3" fill={color} />
    </svg>
  );
}

function CfgSpoke({ deg, color }: { deg: number; color: string }): React.ReactElement {
  const rad = (deg * Math.PI) / 180;
  return (
    <line
      x1={8 + Math.cos(rad) * 3.5}
      y1={8 + Math.sin(rad) * 3.5}
      x2={8 + Math.cos(rad) * 5.5}
      y2={8 + Math.sin(rad) * 5.5}
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  );
}

/** Config gear icon */
export function CfgIcon({ color }: { color: string }): React.ReactElement {
  const spokes = [0, 60, 120, 180, 240, 300];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <circle cx="8" cy="8" r="2" fill={color} />
      {spokes.map((deg) => (
        <CfgSpoke key={deg} deg={deg} color={color} />
      ))}
      <circle cx="8" cy="8" r="3.5" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** Lock icon for lock files */
export function LockIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="1"
      />
      <circle cx="8" cy="10.5" r="1.2" fill={color} />
    </svg>
  );
}

/** Open folder SVG */
export function FolderOpenSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path
        d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 6.5h13l-2 6h-9z"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
