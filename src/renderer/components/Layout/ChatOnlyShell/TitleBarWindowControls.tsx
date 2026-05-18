/**
 * TitleBarWindowControls — Win32 minimize / maximize / close buttons.
 * Extracted from ChatOnlyTitleBar to keep that file under the 300-line limit.
 */

import React, { useEffect, useState } from 'react';

const WIN_BTN =
  'flex items-center justify-center w-[46px] h-full bg-transparent transition-colors duration-100';

const WIN_HOVER_NEUTRAL = 'hover:bg-[rgba(255,255,255,0.08)]'; // hardcoded: win32 hover tint — non-themeable platform chrome
const WIN_HOVER_CLOSE = 'hover:bg-[#e81123] hover:text-white'; // hardcoded: Windows close-button canonical red — non-themeable platform color

interface WinBtnProps {
  onClick: () => void;
  title: string;
  hoverClass?: string;
  children: React.ReactNode;
}

function WinBtn({
  onClick,
  title,
  hoverClass = WIN_HOVER_NEUTRAL,
  children,
}: WinBtnProps): React.ReactElement {
  return (
    <button
      className={`${WIN_BTN} text-text-semantic-muted ${hoverClass}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function MinimizeBtn({ api }: { api: typeof window.electronAPI.app }): React.ReactElement {
  return (
    <WinBtn onClick={() => api?.minimizeWindow()} title="Minimize">
      <svg width="10" height="1" viewBox="0 0 10 1">
        <rect width="10" height="1" fill="currentColor" />
      </svg>
    </WinBtn>
  );
}

function MaximizeBtn({ api }: { api: typeof window.electronAPI.app }): React.ReactElement {
  return (
    <WinBtn onClick={() => api?.toggleMaximizeWindow()} title="Maximize">
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <rect x="0.5" y="0.5" width="9" height="9" />
      </svg>
    </WinBtn>
  );
}

function CloseBtn({ api }: { api: typeof window.electronAPI.app }): React.ReactElement {
  return (
    <WinBtn onClick={() => api?.closeWindow()} title="Close" hoverClass={WIN_HOVER_CLOSE}>
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
        <line x1="1" y1="1" x2="9" y2="9" />
        <line x1="9" y1="1" x2="1" y2="9" />
      </svg>
    </WinBtn>
  );
}

export function WindowControls(): React.ReactElement | null {
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    window.electronAPI?.app
      ?.getPlatform?.()
      .then(setPlatform)
      .catch(() => {});
  }, []);
  if (platform !== 'win32') return null;
  const api = window.electronAPI?.app;
  return (
    <div
      className="flex items-stretch h-full ml-auto bg-transparent"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <MinimizeBtn api={api} />
      <MaximizeBtn api={api} />
      <CloseBtn api={api} />
    </div>
  );
}
