import { useEffect,useState } from 'react';

/**
 * A boolean toggle backed by localStorage.
 * Reads the initial value from `key` on mount; writes changes back.
 */
export function usePersistedToggle(
  key: string,
  defaultValue: boolean
): [boolean, (updater: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return stored === 'true';
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch { /* ignore */ }
  }, [key, value]);

  return [value, setValue];
}
