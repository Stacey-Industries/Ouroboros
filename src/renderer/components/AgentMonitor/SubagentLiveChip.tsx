/**
 * SubagentLiveChip.tsx — Wave 27 Phase B
 *
 * Small badge showing the number of currently-running subagents for a session.
 * Hidden when count is zero.
 *
 * Props:
 *   parentSessionId — the host session to count subagents for
 *   onClick         — called when clicked; can open SubagentPanel list
 */

import React, { useEffect, useState } from 'react';

export interface SubagentLiveChipProps {
  parentSessionId: string;
  onClick?: () => void;
}

function useLiveCount(parentSessionId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!parentSessionId) return;

    let cancelled = false;

    async function fetch(): Promise<void> {
      try {
        const result = await window.electronAPI.subagent.liveCount({ parentSessionId });
        if (!cancelled && result.success && typeof result.count === 'number') {
          setCount(result.count);
        }
      } catch {
        // Non-critical — leave count as-is on error
      }
    }

    void fetch();
    const cleanup = window.electronAPI.subagent.onUpdated((event) => {
      if (event.parentSessionId === parentSessionId) void fetch();
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [parentSessionId]);

  return count;
}

export function SubagentLiveChip({
  parentSessionId,
  onClick,
}: SubagentLiveChipProps): React.ReactElement | null {
  const count = useLiveCount(parentSessionId);

  if (count === 0) return null;

  return (
    <button
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-interactive-accent-subtle text-text-semantic-primary border border-border-subtle transition-colors hover:bg-interactive-hover"
      onClick={onClick}
      aria-label={`${count.toString()} subagent${count === 1 ? '' : 's'} running — click to view`}
      title={`${count.toString()} subagent${count === 1 ? '' : 's'} running`}
      style={{ cursor: onClick ? 'pointer' : 'default', background: 'none', border: 'none' }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: '6px',
          height: '6px',
          background: 'var(--interactive-accent)',
          animation: 'pulse 2s infinite',
        }}
        aria-hidden="true"
      />
      {count}
    </button>
  );
}
