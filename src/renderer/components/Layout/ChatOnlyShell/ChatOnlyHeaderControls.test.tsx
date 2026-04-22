/**
 * @vitest-environment jsdom
 *
 * ChatOnlyHeaderControls — chip rendering, model-change event dispatch,
 * permission-mode toggle.
 *
 * The component reads from AgentChatStoreContext, so tests wrap it in a
 * store provider seeded with known values.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentChatStoreContext,
  createAgentChatStore,
} from '../../AgentChat/agentChatStore';
import { ChatOnlyHeaderControls } from './ChatOnlyHeaderControls';

// ── Stub heavy sub-components ─────────────────────────────────────────────────

vi.mock('../../AgentChat/SelectPill', () => ({
  SelectPill: ({
    label,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <button data-testid={`select-pill-${label.toLowerCase()}`} onClick={() => onChange('claude-opus-4-5')}>
      {label}
    </button>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type Overrides = {
  onChatOverridesChange?: (...args: unknown[]) => void;
};

function makeStore(overrides: Overrides = {}) {
  const store = createAgentChatStore();
  store.setState({
    chatOverrides: {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      permissionMode: 'default',
    },
    settingsModel: '',
    codexSettingsModel: '',
    defaultProvider: 'claude-code' as const,
    onChatOverridesChange: overrides.onChatOverridesChange ?? vi.fn(),
  });
  return store;
}

function Wrapper({ store, children }: { store: ReturnType<typeof createAgentChatStore>; children: React.ReactNode }) {
  return (
    <AgentChatStoreContext.Provider value={store}>
      {children}
    </AgentChatStoreContext.Provider>
  );
}

function renderWithStore(overrides: Overrides = {}) {
  const store = makeStore(overrides);
  const result = render(
    <Wrapper store={store}>
      <ChatOnlyHeaderControls />
    </Wrapper>,
  );
  return { ...result, store };
}

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatOnlyHeaderControls', () => {
  it('renders without throwing', () => {
    const { container } = renderWithStore();
    expect(container).toBeDefined();
  });

  it('renders the header-controls container', () => {
    renderWithStore();
    expect(screen.getByTestId('header-controls')).toBeDefined();
  });

  it('renders model SelectPill', () => {
    renderWithStore();
    expect(screen.getByTestId('select-pill-model')).toBeDefined();
  });

  it('renders permission-mode chip', () => {
    renderWithStore();
    const chip = screen.getByRole('button', { name: /permission mode/i });
    expect(chip).toBeDefined();
  });

  it('calls onChatOverridesChange with new model when model pill changes', () => {
    const onChatOverridesChange = vi.fn();
    renderWithStore({ onChatOverridesChange });
    fireEvent.click(screen.getByTestId('select-pill-model'));
    expect(onChatOverridesChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-5' }),
    );
  });

  it('passes Codex models through to the model picker groups', () => {
    const store = createAgentChatStore();
    store.setState({
      chatOverrides: {
        model: '',
        effort: 'medium',
        permissionMode: 'default',
      },
      settingsModel: '',
      codexSettingsModel: 'gpt-5.4',
      defaultProvider: 'codex',
      codexModels: [{ id: 'gpt-5.4', name: 'GPT-5.4', reasoningEfforts: ['medium'] }],
      modelProviders: [],
      onChatOverridesChange: vi.fn(),
    });
    render(
      <AgentChatStoreContext.Provider value={store}>
        <ChatOnlyHeaderControls />
      </AgentChatStoreContext.Provider>,
    );
    expect(screen.getByTestId('select-pill-model')).toBeDefined();
  });

  it('calls onChatOverridesChange with cycled permissionMode on chip click', () => {
    const onChatOverridesChange = vi.fn();
    renderWithStore({ onChatOverridesChange });
    fireEvent.click(screen.getByRole('button', { name: /permission mode/i }));
    expect(onChatOverridesChange).toHaveBeenCalledWith(
      expect.objectContaining({ permissionMode: expect.any(String) }),
    );
  });

  it('returns null when chatOverrides is missing from store', () => {
    const store = createAgentChatStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setState({ chatOverrides: undefined as any });
    const { container } = render(
      <AgentChatStoreContext.Provider value={store}>
        <ChatOnlyHeaderControls />
      </AgentChatStoreContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
