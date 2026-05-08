/**
 * walkingSkeletonStub.ts — Phase 1 hardcoded canonical flow + stubbed FlowTrace.
 *
 * ONE hardcoded flow: "When I send a chat message".
 * Real file paths + line numbers derived from the actual codebase — NOT fabricated.
 * Placeholder narration uses literal [stub] markers so Phase 3 can grep them out.
 *
 * This entire file is the Phase 1 swap-out target:
 *   Phase 2 → replace hardcoded boundary registry with Tree-sitter scan
 *   Phase 3 → replace [stub] narration with narrationCache.ts output
 *   Phase 5 → replace single tile with canonicalFlows.ts output
 *
 * DELETABLE: Phases 2-5 can remove this file entirely once real implementations
 * exist. It is a self-contained stub with no callers outside index.ts.
 */

import type { CanonicalFlow, FlowEdge, FlowStep, FlowTrace } from '../../shared/types/flowTracer';

// ── Hardcoded entry point ─────────────────────────────────────────────────────
// Real location of the sendMessage IPC handler registration in the codebase.
// Verified via grep: src/main/ipc-handlers/agentChat.ts line 163.

const CHAT_SEND_ENTRY_POINT = {
  symbol: 'registerMessageHandlers',
  file: 'src/main/ipc-handlers/agentChat.ts',
  line: 163,
};

// ── Hardcoded canonical flows (Phase 1: one tile) ────────────────────────────

export const WALKING_SKELETON_FLOWS: CanonicalFlow[] = [
  {
    title: 'When I send a chat message',
    entryPoint: CHAT_SEND_ENTRY_POINT,
    estimatedSteps: 6,
    layers: ['renderer', 'preload', 'main', 'cli'],
  },
];

// ── Stub helpers ──────────────────────────────────────────────────────────────

function stubNarration(what: string, why: string, how: string) {
  return { what: `[stub] ${what}`, why: `[stub] ${why}`, how: `[stub] ${how}` };
}

function buildRendererStep(): FlowStep {
  return {
    id: 'step-1',
    layer: 'renderer',
    symbol: 'handleSubmit',
    file: 'src/renderer/components/AgentChat/AgentChatComposer.tsx',
    line: 1,
    kind: 'function',
    narration: stubNarration(
      'Submit handler that fires when the user presses Enter or clicks Send.',
      'Centralises input validation before dispatching to the IPC layer.',
      'Reads Lexical editor state, serialises to plain text, calls window.electronAPI.agentChat.sendMessage.',
    ),
  };
}

function buildPreloadStep(): FlowStep {
  return {
    id: 'step-2',
    layer: 'preload',
    symbol: 'agentChat.sendMessage',
    file: 'src/preload/preloadSupplementalAgentChatApis.ts',
    line: 1,
    kind: 'ipc-bridge',
    narration: stubNarration(
      'contextBridge relay that forwards the send request to the main process.',
      'Electron security model isolates the renderer from Node.js; all IPC crosses via the preload bridge.',
      'Calls ipcRenderer.invoke("agentChat:sendMessage", request) and returns the Promise to the renderer.',
    ),
  };
}

function buildIpcHandlerStep(): FlowStep {
  return {
    id: 'step-3',
    layer: 'main',
    symbol: 'registerMessageHandlers',
    file: 'src/main/ipc-handlers/agentChat.ts',
    line: 163,
    kind: 'ipc-handler',
    narration: stubNarration(
      'ipcMain.handle registration that receives the send request on the main-process side.',
      'Main process owns the orchestration layer and the thread store; the handler routes to both.',
      'Validates the request, delegates to svc.sendMessage which goes through the orchestration bridge.',
    ),
  };
}

function buildBridgeSendStep(): FlowStep {
  return {
    id: 'step-4',
    layer: 'main',
    symbol: 'sendMessageWithBridge',
    file: 'src/main/agentChat/chatOrchestrationBridge.ts',
    line: 140,
    kind: 'function',
    narration: stubNarration(
      'Bridge function that converts a send request into a task for the orchestration layer.',
      'Decouples the IPC handler from task lifecycle management; the bridge owns the active-send registry.',
      'Validates, checks for slash commands, builds a TaskRequest via preparePendingSend, then calls createTask + startTask.',
    ),
  };
}

function buildBridgeFactoryStep(): FlowStep {
  return {
    id: 'step-5',
    layer: 'main',
    symbol: 'createAgentChatOrchestrationBridge',
    file: 'src/main/agentChat/chatOrchestrationBridge.ts',
    line: 260,
    kind: 'function',
    narration: stubNarration(
      'Factory that assembles the bridge runtime with the orchestration API.',
      'Provides a consistent internal API so the IPC handler does not need to know orchestration internals.',
      'Wraps orchestration.createTask and orchestration.startTask; sets up progress and session-update subscriptions.',
    ),
  };
}

function buildCliStep(): FlowStep {
  return {
    id: 'step-6',
    layer: 'cli',
    symbol: 'spawnClaude',
    file: 'src/main/pty.ts',
    line: 1,
    kind: 'spawn',
    narration: stubNarration(
      'Subprocess spawn that launches a Claude Code CLI session to process the message.',
      'Auth constraint: Max subscription with no API key means all LLM calls go through the installed Claude CLI.',
      'Forks a node-pty subprocess running the claude binary; stdout is piped back via stream-json events.',
    ),
  };
}

function buildChatSendSteps(): FlowStep[] {
  return [
    buildRendererStep(),
    buildPreloadStep(),
    buildIpcHandlerStep(),
    buildBridgeSendStep(),
    buildBridgeFactoryStep(),
    buildCliStep(),
  ];
}

function buildChatSendEdges(): FlowEdge[] {
  return [
    { from: 'step-1', to: 'step-2', kind: 'sync' },
    { from: 'step-2', to: 'step-3', kind: 'boundary', boundaryChannel: 'agentChat:sendMessage' },
    { from: 'step-3', to: 'step-4', kind: 'sync' },
    { from: 'step-4', to: 'step-5', kind: 'sync' },
    { from: 'step-5', to: 'step-6', kind: 'async' },
  ];
}

// ── Public factory ────────────────────────────────────────────────────────────

export function getWalkingSkeletonTrace(): FlowTrace {
  const steps = buildChatSendSteps();
  const edges = buildChatSendEdges();
  const distinctLayers = new Set(steps.map((s) => s.layer));
  const boundaryEdges = edges.filter((e) => e.kind === 'boundary');

  return {
    id: 'walking-skeleton-chat-send',
    title: 'When I send a chat message',
    entryPoint: CHAT_SEND_ENTRY_POINT,
    steps,
    edges,
    generatedAt: Date.now(),
    graphVersion: 'walking-skeleton-phase-1',
    metadata: {
      layerCount: distinctLayers.size,
      boundaryCount: boundaryEdges.length,
      depthCapHit: false,
    },
  };
}
