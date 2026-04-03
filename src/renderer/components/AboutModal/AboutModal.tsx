/**
 * AboutModal — shows app version, system info, and project links.
 * Follows the UsageModal pattern: fixed backdrop, escape/click-outside to close.
 */

import React, { useCallback, useEffect, useState } from 'react';

import ouroborosLogo from '../../../../public/OUROBOROS.png';
import { SHOW_ABOUT_EVENT } from '../../hooks/appEventNames';

interface AboutData {
  version: string;
  platform: string;
  electron: string;
  chrome: string;
  node: string;
}

function useAboutModal(): { isOpen: boolean; data: AboutData | null; close: () => void } {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<AboutData | null>(null);

  useEffect(() => {
    const handler = (e: Event): void => {
      const { version, platform } = (e as CustomEvent).detail ?? {};
      const sys = window.electronAPI?.app?.getSystemInfo?.() ?? { electron: '', chrome: '', node: '' };
      setData({ version: version ?? '', platform: platform ?? '', ...sys });
      setIsOpen(true);
    };
    window.addEventListener(SHOW_ABOUT_EVENT, handler);
    return () => window.removeEventListener(SHOW_ABOUT_EVENT, handler);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  return { isOpen, data, close };
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between py-1">
      <span className="text-text-semantic-muted text-xs">{label}</span>
      <span className="text-text-semantic-primary text-xs font-mono">{value}</span>
    </div>
  );
}

const GITHUB_URL = 'https://github.com/hesnotsoharry/Ouroboros';

function AboutHeader({ version }: { version: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center pt-6 pb-4 px-6">
      <img src={ouroborosLogo} alt="Ouroboros" className="select-none" draggable={false}
        style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 12 }} />
      <h2 className="text-text-semantic-primary text-base font-semibold">Ouroboros</h2>
      <span className="text-text-semantic-muted text-xs mt-1">Version {version}</span>
    </div>
  );
}

function AboutSystemInfo({ data }: { data: AboutData }): React.ReactElement {
  return (
    <div className="px-6 pb-4">
      <div className="border-t border-border-semantic-subtle pt-3 space-y-0.5">
        <InfoRow label="Platform" value={data.platform} />
        <InfoRow label="Electron" value={data.electron} />
        <InfoRow label="Chrome" value={data.chrome} />
        <InfoRow label="Node.js" value={data.node} />
      </div>
    </div>
  );
}

function AboutActions({ onClose }: { onClose: () => void }): React.ReactElement {
  const openGitHub = useCallback(() => {
    window.electronAPI?.app?.openExternal?.(GITHUB_URL);
  }, []);

  return (
    <div className="flex gap-2 px-6 pb-5">
      <button
        onClick={openGitHub}
        className="flex-1 text-xs py-1.5 rounded border border-border-semantic bg-surface-raised text-text-semantic-primary hover:bg-surface-hover transition-colors"
      >
        GitHub
      </button>
      <button
        onClick={onClose}
        className="flex-1 text-xs py-1.5 rounded bg-interactive-accent text-text-semantic-on-accent hover:bg-interactive-hover transition-colors"
      >
        Close
      </button>
    </div>
  );
}

function AboutContent({ data, onClose }: { data: AboutData; onClose: () => void }): React.ReactElement {
  return (
    <div
      className="bg-surface-panel border border-border-semantic rounded-lg shadow-2xl"
      style={{ width: '380px', maxHeight: '80vh', overflow: 'auto' }}
      onClick={(e) => e.stopPropagation()}
    >
      <AboutHeader version={data.version} />
      <AboutSystemInfo data={data} />
      {/* Credits */}
      <div className="px-6 pb-4">
        <div className="border-t border-border-semantic-subtle pt-3">
          <p className="text-text-semantic-muted text-xs leading-relaxed">
            Built with Claude Code, running inside itself.
          </p>
          <p className="text-text-semantic-faint text-xs mt-1">
            MIT License &middot; &copy; {new Date().getFullYear()} Ouroboros
          </p>
        </div>
      </div>
      <AboutActions onClose={onClose} />
    </div>
  );
}

export function AboutModal(): React.ReactElement | null {
  const { isOpen, data, close } = useAboutModal();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={close}
    >
      <AboutContent data={data} onClose={close} />
    </div>
  );
}
