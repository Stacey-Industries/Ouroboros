import { useCallback,useEffect, useState } from 'react';

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    // Keyboard shortcut: Ctrl+Shift+P (Windows/Linux) or Cmd+Shift+P (macOS)
    const handleKeyDown = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [toggle]);

  // Also listen for the custom event dispatched by the main-process menu handler
  useEffect(() => {
    const handleMenuEvent = (): void => open();
    window.addEventListener('agent-ide:command-palette', handleMenuEvent);
    return () => window.removeEventListener('agent-ide:command-palette', handleMenuEvent);
  }, [open]);

  return { isOpen, open, close, toggle };
}
