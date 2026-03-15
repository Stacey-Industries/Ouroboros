import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolActivity } from './AgentChatToolCard';

export interface AgentChatStreamChunk {
  threadId: string;
  messageId: string;
  type: 'text_delta' | 'thinking_delta' | 'tool_activity' | 'complete' | 'error';
  textDelta?: string;
  thinkingDelta?: string;
  toolActivity?: { name: string; status: 'running' | 'complete'; filePath?: string };
  timestamp: number;
}

/** A discrete block within a single assistant turn */
export type AssistantTurnBlock =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string; startedAt: number; duration?: number }
  | { kind: 'tool_use'; tool: ToolActivity; blockId: string };

export interface AgentChatStreamingState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  blocks: AssistantTurnBlock[];
  /** The text content currently being appended to (the last text block, if any) */
  activeTextContent: string;
}

const INITIAL_STATE: AgentChatStreamingState = {
  isStreaming: false,
  streamingMessageId: null,
  blocks: [],
  activeTextContent: '',
};

let blockIdCounter = 0;
function generateBlockId(): string {
  return `block-${++blockIdCounter}`;
}

/**
 * Seals any open thinking block by computing its final duration.
 * Returns a new blocks array (or the same one if nothing changed).
 */
function sealThinkingBlocks(blocks: AssistantTurnBlock[], now: number): AssistantTurnBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    if (b.kind === 'thinking' && b.duration === undefined) {
      changed = true;
      return { ...b, duration: Math.round((now - b.startedAt) / 1000) };
    }
    return b;
  });
  return changed ? next : blocks;
}

export function useAgentChatStreaming(activeThreadId: string | null): AgentChatStreamingState {
  const [state, setState] = useState<AgentChatStreamingState>(INITIAL_STATE);
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;

  const handleChunk = useCallback((chunk: AgentChatStreamChunk) => {
    // Ignore chunks for threads that are not currently active
    if (chunk.threadId !== activeThreadIdRef.current) return;

    switch (chunk.type) {
      case 'text_delta': {
        const delta = chunk.textDelta ?? '';
        setState((prev) => {
          // Seal any open thinking blocks before appending text
          const sealed = sealThinkingBlocks(prev.blocks, Date.now());
          const blocks = [...sealed];
          const lastBlock = blocks[blocks.length - 1];

          if (lastBlock && lastBlock.kind === 'text') {
            // Append to the existing text block
            blocks[blocks.length - 1] = { kind: 'text', content: lastBlock.content + delta };
          } else {
            // No block yet or last block is not text — start a new text block
            blocks.push({ kind: 'text', content: delta });
          }

          const activeTextContent = (blocks[blocks.length - 1] as { kind: 'text'; content: string }).content;

          return {
            ...prev,
            isStreaming: true,
            streamingMessageId: chunk.messageId,
            blocks,
            activeTextContent,
          };
        });
        break;
      }

      case 'thinking_delta': {
        const delta = chunk.thinkingDelta ?? '';
        setState((prev) => {
          const blocks = [...prev.blocks];
          const lastBlock = blocks[blocks.length - 1];

          if (lastBlock && lastBlock.kind === 'thinking' && lastBlock.duration === undefined) {
            // Append to the open thinking block
            blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + delta };
          } else {
            // Start a new thinking block
            blocks.push({ kind: 'thinking', content: delta, startedAt: Date.now() });
          }

          return {
            ...prev,
            isStreaming: true,
            streamingMessageId: chunk.messageId,
            blocks,
            activeTextContent: prev.activeTextContent,
          };
        });
        break;
      }

      case 'tool_activity': {
        if (!chunk.toolActivity) break;
        const { name, status, filePath } = chunk.toolActivity;

        setState((prev) => {
          // Seal any open thinking blocks
          const sealed = sealThinkingBlocks(prev.blocks, Date.now());

          if (status === 'running') {
            // Seal the current text block and push a new tool_use block
            const blocks: AssistantTurnBlock[] = [
              ...sealed,
              { kind: 'tool_use', tool: { name, status, filePath }, blockId: generateBlockId() },
            ];
            return {
              ...prev,
              isStreaming: true,
              streamingMessageId: chunk.messageId,
              blocks,
              activeTextContent: '',
            };
          }

          // status === 'complete': find existing running tool block and update it
          const blocks = [...sealed];
          let found = false;
          for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            if (block.kind === 'tool_use' && block.tool.name === name && block.tool.status === 'running') {
              blocks[i] = { ...block, tool: { name, status, filePath } };
              found = true;
              break;
            }
          }

          if (!found) {
            // Edge case: no matching running block — push a new complete block
            blocks.push({ kind: 'tool_use', tool: { name, status, filePath }, blockId: generateBlockId() });
          }

          return {
            ...prev,
            isStreaming: true,
            streamingMessageId: chunk.messageId,
            blocks,
            activeTextContent: prev.activeTextContent,
          };
        });
        break;
      }

      case 'complete':
        setState(INITIAL_STATE);
        break;

      case 'error':
        setState(INITIAL_STATE);
        break;
    }
  }, []);

  useEffect(() => {
    // Safety check: the preload API may not exist yet (built in parallel)
    const api = (window as any).electronAPI?.agentChat;
    if (!api?.onStreamChunk) return;

    const cleanup = api.onStreamChunk(handleChunk);
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [handleChunk]);

  // Reset streaming state when the active thread changes
  useEffect(() => {
    setState(INITIAL_STATE);
  }, [activeThreadId]);

  return state;
}
