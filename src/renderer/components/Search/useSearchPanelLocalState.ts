import { useCallback, useRef, useState } from 'react';

function useSyncedChangeHandler(
  setLocal: React.Dispatch<React.SetStateAction<string>>,
  setExternal: (v: string) => void,
): (v: string) => void {
  return useCallback(
    (v: string) => {
      setLocal(v);
      setExternal(v);
    },
    [setExternal, setLocal],
  );
}

export function useSearchPanelLocalState(
  setIncludeGlob: (v: string) => void,
  setExcludeGlob: (v: string) => void,
): {
  filterExpanded: boolean;
  setFilterExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  collapsedFiles: Set<string>;
  includeGlob: string;
  excludeGlob: string;
  handleIncludeChange: (v: string) => void;
  handleExcludeChange: (v: string) => void;
  handleToggleFile: (fp: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
} {
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [includeGlob, setIncludeGlobLocal] = useState('');
  const [excludeGlob, setExcludeGlobLocal] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleIncludeChange = useSyncedChangeHandler(setIncludeGlobLocal, setIncludeGlob);
  const handleExcludeChange = useSyncedChangeHandler(setExcludeGlobLocal, setExcludeGlob);
  const handleToggleFile = useCallback((fp: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fp)) {
        next.delete(fp);
      } else {
        next.add(fp);
      }
      return next;
    });
  }, []);

  return { filterExpanded, setFilterExpanded, collapsedFiles, includeGlob, excludeGlob, handleIncludeChange, handleExcludeChange, handleToggleFile, inputRef };
}
