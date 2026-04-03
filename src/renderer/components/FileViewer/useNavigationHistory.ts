/**
 * useNavigationHistory — back/forward file navigation, VS Code style.
 *
 * Tracks a stack of visited file paths. Integrates with FileViewerManager
 * via the active file path — when it changes, the previous path is pushed
 * to the back stack (unless the change came from goBack/goForward itself).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { GO_BACK_EVENT, GO_FORWARD_EVENT } from '../../hooks/appEventNames';

const MAX_HISTORY = 50;

interface NavigationHistory {
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

function useMenuEventListeners(goBack: () => void, goForward: () => void): void {
  useEffect(() => {
    const onBack = () => goBack();
    const onForward = () => goForward();
    window.addEventListener(GO_BACK_EVENT, onBack);
    window.addEventListener(GO_FORWARD_EVENT, onForward);
    return () => {
      window.removeEventListener(GO_BACK_EVENT, onBack);
      window.removeEventListener(GO_FORWARD_EVENT, onForward);
    };
  }, [goBack, goForward]);
}

function navigateStack(
  setStack: React.Dispatch<React.SetStateAction<string[]>>,
  opts: { pushOpposite: (p: string) => void; isNavigatingRef: React.MutableRefObject<boolean>; prevPathRef: React.MutableRefObject<string | null>; setActive: (f: string) => void },
): void {
  setStack((current) => {
    if (current.length === 0) return current;
    const target = current[current.length - 1];
    const prev = opts.prevPathRef.current;
    if (prev) opts.pushOpposite(prev);
    opts.isNavigatingRef.current = true;
    opts.setActive(target);
    return current.slice(0, -1);
  });
}

export function useNavigationHistory(
  activePath: string | null,
  setActive: (filePath: string) => void,
): NavigationHistory {
  const [backStack, setBackStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const isNavigatingRef = useRef(false);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = activePath;
    if (isNavigatingRef.current) { isNavigatingRef.current = false; return; }
    if (prev && prev !== activePath) {
      setBackStack((s) => [...s.slice(-MAX_HISTORY + 1), prev]);
      setForwardStack([]);
    }
  }, [activePath]);

  const goBack = useCallback(() => {
    navigateStack(setBackStack, { pushOpposite: (p) => setForwardStack((f) => [...f, p]), isNavigatingRef, prevPathRef, setActive });
  }, [setActive]);

  const goForward = useCallback(() => {
    navigateStack(setForwardStack, { pushOpposite: (p) => setBackStack((b) => [...b, p]), isNavigatingRef, prevPathRef, setActive });
  }, [setActive]);

  useMenuEventListeners(goBack, goForward);
  return { goBack, goForward, canGoBack: backStack.length > 0, canGoForward: forwardStack.length > 0 };
}
