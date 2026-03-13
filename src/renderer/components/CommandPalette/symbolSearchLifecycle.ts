import React, { useEffect, useRef } from 'react';
import type { SymbolEntry } from '../../types/electron';

const symbolCache = new Map<string, SymbolEntry[]>();

export function useSymbolSearchLifecycle({
  inputRef,
  isOpen,
  listRef,
  matchesLength,
  projectRoot,
  selectedIndex,
  setAllSymbols,
  setIsLoading,
  setLoadError,
  setQuery,
  setSelectedIndex,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  matchesLength: number;
  projectRoot: string | null;
  selectedIndex: number;
  setAllSymbols: React.Dispatch<React.SetStateAction<SymbolEntry[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): void {
  useLoadSymbols({ isOpen, projectRoot, setAllSymbols, setIsLoading, setLoadError });
  useCacheInvalidation({ projectRoot, setAllSymbols });
  useResetOnOpen({ inputRef, isOpen, setQuery, setSelectedIndex });
  useClampIndex(matchesLength, setSelectedIndex);
  useScrollIntoView(listRef, selectedIndex);
}

type LoadSymbolsOptions = {
  isOpen: boolean;
  projectRoot: string | null;
  setAllSymbols: React.Dispatch<React.SetStateAction<SymbolEntry[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadError: React.Dispatch<React.SetStateAction<string | null>>;
};

function useLoadSymbols({
  isOpen,
  projectRoot,
  setAllSymbols,
  setIsLoading,
  setLoadError,
}: LoadSymbolsOptions): void {
  useEffect(() => {
    if (!isOpen || !projectRoot) {
      return;
    }

    const cached = symbolCache.get(projectRoot);
    if (cached) {
      setAllSymbols(cached);
      return;
    }

    const requestState = { cancelled: false };
    setIsLoading(true);
    setLoadError(null);
    void loadSymbols(projectRoot, createLoadHandlers(requestState, projectRoot, {
      setAllSymbols,
      setIsLoading,
      setLoadError,
    }));

    return () => {
      requestState.cancelled = true;
    };
  }, [isOpen, projectRoot, setAllSymbols, setIsLoading, setLoadError]);
}

function createLoadHandlers(
  requestState: { cancelled: boolean },
  projectRoot: string,
  {
    setAllSymbols,
    setIsLoading,
    setLoadError,
  }: Pick<LoadSymbolsOptions, 'setAllSymbols' | 'setIsLoading' | 'setLoadError'>,
) {
  return {
    onError: (error: string) => {
      if (!requestState.cancelled) {
        setLoadError(error);
      }
    },
    onFinally: () => {
      if (!requestState.cancelled) {
        setIsLoading(false);
      }
    },
    onSuccess: (symbols: SymbolEntry[]) => {
      if (!requestState.cancelled) {
        symbolCache.set(projectRoot, symbols);
        setAllSymbols(symbols);
      }
    },
  };
}

async function loadSymbols(
  projectRoot: string,
  handlers: {
    onError: (error: string) => void;
    onFinally: () => void;
    onSuccess: (symbols: SymbolEntry[]) => void;
  },
): Promise<void> {
  try {
    const result = await window.electronAPI.symbol.search(projectRoot);

    if (result.success && result.symbols) {
      handlers.onSuccess(result.symbols);
      return;
    }

    handlers.onError(result.error ?? 'Failed to scan symbols');
  } catch (error) {
    handlers.onError(String(error));
  } finally {
    handlers.onFinally();
  }
}

function useCacheInvalidation({
  projectRoot,
  setAllSymbols,
}: {
  projectRoot: string | null;
  setAllSymbols: React.Dispatch<React.SetStateAction<SymbolEntry[]>>;
}): void {
  const previousRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (projectRoot === previousRootRef.current) {
      return;
    }

    if (previousRootRef.current !== null) {
      symbolCache.delete(previousRootRef.current);
      setAllSymbols([]);
    }

    previousRootRef.current = projectRoot;
  }, [projectRoot, setAllSymbols]);
}

function useResetOnOpen({
  inputRef,
  isOpen,
  setQuery,
  setSelectedIndex,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery('');
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputRef, isOpen, setQuery, setSelectedIndex]);
}

function useClampIndex(
  length: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    setSelectedIndex((previous) => (length === 0 ? 0 : Math.min(previous, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(
  listRef: React.RefObject<HTMLDivElement | null>,
  selectedIndex: number,
): void {
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listRef, selectedIndex]);
}
