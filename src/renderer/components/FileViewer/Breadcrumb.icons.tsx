import React from 'react';

type IconColor = string;

function TsIcon({ color }: { color: IconColor }): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill={color} />
      <text x="7" y="10.5" textAnchor="middle" fill="#fff" fontSize="7.5" fontWeight="bold" fontFamily="sans-serif">TS</text>
    </svg>
  );
}

function JsIcon({ color }: { color: IconColor }): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill={color} />
      <text x="7" y="10.5" textAnchor="middle" fill="#fff" fontSize="7.5" fontWeight="bold" fontFamily="sans-serif">JS</text>
    </svg>
  );
}

function CssIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#8b5cf6" />
      <text x="7" y="10" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold" fontFamily="sans-serif">#</text>
    </svg>
  );
}

function JsonIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#eab308" />
      <text x="7" y="10.5" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">{'{}'}</text>
    </svg>
  );
}

function MdIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#6b7280" />
      <text x="7" y="10.5" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">M</text>
    </svg>
  );
}

function HtmlIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#e44d26" />
      <text x="7" y="10" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold" fontFamily="sans-serif">&lt;/&gt;</text>
    </svg>
  );
}

function GenericFileIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 1.5h5.5L12 5v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <path d="M8.5 1.5V5H12" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const fileIconFactories: Record<string, () => React.ReactElement> = {
  '.ts': () => <TsIcon color="#3178c6" />,
  '.tsx': () => <TsIcon color="#3178c6" />,
  '.js': () => <JsIcon color="#f0db4f" />,
  '.jsx': () => <JsIcon color="#f0db4f" />,
  '.mjs': () => <JsIcon color="#b8a936" />,
  '.cjs': () => <JsIcon color="#b8a936" />,
  '.css': () => <CssIcon />,
  '.scss': () => <CssIcon />,
  '.less': () => <CssIcon />,
  '.json': () => <JsonIcon />,
  '.jsonc': () => <JsonIcon />,
  '.md': () => <MdIcon />,
  '.mdx': () => <MdIcon />,
  '.html': () => <HtmlIcon />,
  '.htm': () => <HtmlIcon />,
};

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

export function FileTypeIcon({ filename }: { filename: string }): React.ReactElement {
  const createIcon = fileIconFactories[getExtension(filename)];
  return createIcon ? createIcon() : <GenericFileIcon />;
}
