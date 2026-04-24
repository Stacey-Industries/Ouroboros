import { useEffect, useState } from 'react';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

async function readChatWorkbenchFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    return cfg?.layout?.chatWorkbench === true;
  } catch {
    return false;
  }
}

export function useChatWorkbenchFlag(): boolean {
  const [flagOn, setFlagOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readChatWorkbenchFlag().then((value) => {
      if (!cancelled) setFlagOn(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return flagOn;
}
