import React, { useEffect, useRef, useState } from 'react';

/* ---------- Rotating status messages ---------- */

export const OUROBOROS_MESSAGES = [
  'Slithering...',
  'Coiling...',
  'Uncoiling...',
  'Winding...',
  'Shedding...',
  'Striking...',
  'Constricting...',
  'Digesting...',
  'Consuming...',
  'Cycling...',
  'Turning...',
  'Devouring...',
  'Reforming...',
  'Swallowing...',
  'Weaving...',
  'Forming...',
  'Tracing...',
  'Spiraling...',
  'Circling...',
  'Coalescing...',
  'Unwinding...',
];

export function pickNextIndex(prev: number, visited: Set<number>): number {
  if (visited.size >= OUROBOROS_MESSAGES.length) visited.clear();
  let next: number;
  do {
    next = Math.floor(Math.random() * OUROBOROS_MESSAGES.length);
  } while (next === prev || visited.has(next));
  visited.add(next);
  return next;
}

/* ---------- Blinking cursor ---------- */

export function BlinkingCursor(): React.ReactElement {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] align-text-bottom"
      style={{
        backgroundColor: 'var(--accent)',
        animation: 'agent-chat-cursor-blink 1s step-end infinite',
      }}
    />
  );
}

/* ---------- Slithering snake SVG ---------- */

export function SlitherSnake(): React.ReactElement {
  return (
    <span
      className="inline-flex items-center ml-1.5"
      style={{ animation: 'snakeSway 3.5s ease-in-out infinite' }}
    >
      <span style={{
        display: 'inline-block',
        overflow: 'hidden',
        animation: 'snakeGrow 1.4s ease-out forwards',
      }}>
        <svg width="26" height="14" viewBox="0 0 26 14" fill="none" style={{ overflow: 'visible' }}>
          {/* Wavy body with flowing segments */}
          <path
            d="M1 7 C4 2, 7 2, 10 7 C13 12, 16 12, 19 7"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="3 2"
            style={{ animation: 'snakeFlow 1.2s linear infinite' }}
          />
          {/* Head */}
          <ellipse cx="21" cy="6.5" rx="2.2" ry="2" fill="var(--accent)" />
          {/* Eye */}
          <circle cx="21.5" cy="5.8" r="0.6" fill="var(--bg, #1a1a2e)" />
          {/* Forked tongue */}
          <g style={{ animation: 'snakeTongue 2s ease-in-out infinite' }}>
            <path d="M23 6.5 L24.5 5.5" stroke="var(--error, #f85149)" strokeWidth="0.5" strokeLinecap="round" />
            <path d="M23 6.5 L24.5 7.5" stroke="var(--error, #f85149)" strokeWidth="0.5" strokeLinecap="round" />
          </g>
        </svg>
      </span>
    </span>
  );
}

/* ---------- Streaming status with rotating text + snake ---------- */

export function StreamingStatusMessage({ onStop }: { onStop?: () => Promise<void> }): React.ReactElement {
  const [msgIndex, setMsgIndex] = useState(() => Math.floor(Math.random() * OUROBOROS_MESSAGES.length));
  const [displayChars, setDisplayChars] = useState(0);
  const [showSnake, setShowSnake] = useState(false);
  const visitedRef = useRef(new Set<number>([msgIndex]));

  const message = OUROBOROS_MESSAGES[msgIndex];

  // Typewriter: advance one character every 38ms until word is fully revealed
  useEffect(() => {
    if (displayChars >= message.length) return;
    const id = setTimeout(() => setDisplayChars((c) => c + 1), 38);
    return () => clearTimeout(id);
  }, [displayChars, message.length]);

  // Once word is fully typed: show snake, then cycle to the next word
  useEffect(() => {
    if (displayChars < message.length) return;

    // Brief pause, then snake starts growing
    const snakeId = setTimeout(() => setShowSnake(true), 120);

    // After snake grows + hold time, advance to next word
    // 120ms pause + 1400ms grow + 700ms hold ≈ 2.2s before next cycle
    const cycleId = setTimeout(() => {
      setMsgIndex((prev) => pickNextIndex(prev, visitedRef.current));
      setDisplayChars(0);
      setShowSnake(false);
    }, 120 + 1400 + 700);

    return () => {
      clearTimeout(snakeId);
      clearTimeout(cycleId);
    };
  }, [displayChars, message.length]);

  return (
    <div className="pl-7 py-0.5 flex items-center justify-between pr-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {message.slice(0, displayChars)}
          {displayChars < message.length && <BlinkingCursor />}
        </span>
        {showSnake && <SlitherSnake key={msgIndex} />}
      </div>
      {onStop && (
        <button
          onClick={() => void onStop()}
          title="Stop task"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error, #f85149)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}

/* ---------- Typewriter hook ---------- */

/**
 * Animates text in at ~2700 chars/sec using requestAnimationFrame.
 *
 * Tracks the previous text length so that when new content arrives, only
 * the *delta* is animated — previously-displayed text stays visible
 * instantly. This prevents the "cutoff" effect where large chunks appear
 * to truncate the response while the typewriter catches up.
 *
 * When isStreaming=false (model has finished), the animation jumps to end
 * immediately so there's no artificial delay after the model is done.
 */
export function useTypewriter(text: string, isStreaming: boolean, charsPerFrame = 45): string {
  const [pos, setPos] = useState(0);
  const prevLengthRef = useRef(0);

  // Reset position when text is cleared (streaming session ended or restarted)
  useEffect(() => {
    if (!text) {
      setPos(0);
      prevLengthRef.current = 0;
    }
  }, [text]);

  // When text grows, jump pos to the previously-displayed length so old
  // content stays visible and only the new delta animates in.
  useEffect(() => {
    if (text.length > prevLengthRef.current) {
      setPos((p) => Math.max(p, prevLengthRef.current));
    }
  }, [text.length]);

  // Jump to end immediately when the model stops streaming
  useEffect(() => {
    if (!isStreaming && pos < text.length) {
      setPos(text.length);
      prevLengthRef.current = text.length;
    }
  }, [isStreaming, pos, text.length]);

  // Advance animation toward the full text length each frame (while streaming)
  useEffect(() => {
    if (!isStreaming || pos >= text.length) return;
    const id = requestAnimationFrame(() => {
      setPos((p) => {
        const next = Math.min(p + charsPerFrame, text.length);
        prevLengthRef.current = next;
        return next;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isStreaming, pos, text.length, charsPerFrame]);

  return text.slice(0, pos);
}

