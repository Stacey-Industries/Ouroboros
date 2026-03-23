import { useEffect, useState } from 'react';

export function useSvgSource(filePath: string, isSvg: boolean): string | null {
  const [svgSource, setSvgSource] = useState<string | null>(null);

  useEffect(() => {
    if (!isSvg) {
      setSvgSource(null);
      return;
    }

    let cancelled = false;
    window.electronAPI.files.readFile(filePath).then((result) => {
      if (!cancelled && result.success && result.content != null) {
        setSvgSource(result.content);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filePath, isSvg]);

  return svgSource;
}
