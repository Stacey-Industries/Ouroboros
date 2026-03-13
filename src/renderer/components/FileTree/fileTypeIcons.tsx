/**
 * fileTypeIcons.tsx — SVG icon components for file types.
 *
 * Extracted from FileTypeIcon.tsx to reduce file size.
 * Each icon component renders a 16x16 inline SVG.
 */

import React from 'react';

const S = { flexShrink: 0 } as const;

/** Generic document / file icon */
export function DocIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M3 2h7l3 3v9H3V2z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <path d="M10 2v3h3" fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <line x1="5" y1="7" x2="11" y2="7" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="9.5" x2="11" y2="9.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="12" x2="9" y2="12" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

/** "TS" badge icon */
export function TsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} />
      <text x="8" y="11" textAnchor="middle" fontSize="6.5" fontWeight="bold" fontFamily="monospace" fill="#fff">TS</text>
    </svg>
  );
}

/** "JS" badge icon */
export function JsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} />
      <text x="8" y="11" textAnchor="middle" fontSize="6.5" fontWeight="bold" fontFamily="monospace" fill="#222">JS</text>
    </svg>
  );
}

/** Python icon */
export function PyIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="3" y="2.5" width="6" height="5.5" rx="1.5" fill={color} />
      <rect x="7" y="8" width="6" height="5.5" rx="1.5" fill={color} fillOpacity="0.7" />
      <circle cx="7.5" cy="4.5" r="0.9" fill="#fff" fillOpacity="0.9" />
      <circle cx="8.5" cy="11.5" r="0.9" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

/** JSON curly brace icon */
export function JsonIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="bold" fontFamily="monospace" fill={color}>{'{'}</text>
    </svg>
  );
}

/** Markdown icon */
export function MdIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M2 12V4l4 5 4-5v8" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8h2M13 6v4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** CSS hashtag icon */
export function CssIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <line x1="5" y1="3" x2="4" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="3" x2="9" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="6.5" x2="13" y2="6.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="9.5" x2="13" y2="9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** HTML angle-bracket icon */
export function HtmlIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M4 5L1 8l3 3" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 5l3 3-3 3" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="3" x2="6" y2="13" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

/** YAML/TOML dash-list icon */
export function YamlIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <line x1="3" y1="4.5" x2="5" y2="4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="4.5" x2="13" y2="4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="3" y1="8" x2="5" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="8" x2="11" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="3" y1="11.5" x2="5" y2="11.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="11.5" x2="13" y2="11.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

/** Rust gear icon */
export function RsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <circle cx="8" cy="8" r="2.5" fill={color} />
      <circle cx="8" cy="8" r="5" fill="none" stroke={color} strokeWidth="1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg} x1={8 + Math.cos(rad) * 4.5} y1={8 + Math.sin(rad) * 4.5} x2={8 + Math.cos(rad) * 6} y2={8 + Math.sin(rad) * 6} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

/** Go badge icon */
export function GoIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <text x="8" y="11" textAnchor="middle" fontSize="7" fontWeight="bold" fontFamily="monospace" fill={color}>Go</text>
    </svg>
  );
}

/** Shell terminal icon */
export function ShIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" />
      <path d="M4 6.5l2.5 2-2.5 2" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="10.5" x2="12" y2="10.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Image mountain icon */
export function ImgIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" />
      <path d="M2 12l3.5-5 3 3.5 2-2.5 3.5 4z" fill={color} fillOpacity="0.6" stroke="none" />
      <circle cx="12" cy="5.5" r="1.3" fill={color} />
    </svg>
  );
}

/** Config gear icon */
export function CfgIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <circle cx="8" cy="8" r="2" fill={color} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg} x1={8 + Math.cos(rad) * 3.5} y1={8 + Math.sin(rad) * 3.5} x2={8 + Math.cos(rad) * 5.5} y2={8 + Math.sin(rad) * 5.5} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        );
      })}
      <circle cx="8" cy="8" r="3.5" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** Lock icon for lock files */
export function LockIcon({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <circle cx="8" cy="10.5" r="1.2" fill={color} />
    </svg>
  );
}

/** Open folder SVG */
export function FolderOpenSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <path d="M1.5 6.5h13l-2 6h-9z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** Closed folder SVG */
export function FolderClosedSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={S}>
      <path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
