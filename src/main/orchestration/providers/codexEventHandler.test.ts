import { describe, expect, it, vi } from 'vitest';

import * as editProvenance from '../editProvenance';
import { buildCodexEventHandler } from './codexEventHandler';

describe('buildCodexEventHandler', () => {
  it('records edit provenance for Codex file_change items (Wave 53 Phase C)', () => {
    const markAgentEdit = vi.fn();
    vi.spyOn(editProvenance, 'getEditProvenanceStore').mockReturnValue({
      markAgentEdit,
      markUserEdit: vi.fn(),
      getEditProvenance: vi.fn(),
      close: vi.fn(),
    });

    const emit = vi.fn();
    const { handler } = buildCodexEventHandler(
      { emit },
      { provider: 'codex', sessionId: 'session-1' },
    );

    handler({
      type: 'item.completed',
      item: {
        type: 'file_change',
        changes: [
          { path: 'C:/repo/src/foo.ts', kind: 'edit' },
          { path: 'C:/repo/src/bar.ts', kind: 'add' },
        ],
      },
    });

    expect(markAgentEdit).toHaveBeenCalledWith('C:/repo/src/foo.ts');
    expect(markAgentEdit).toHaveBeenCalledWith('C:/repo/src/bar.ts');
  });


  it('uses prompt input tokens only for Codex context usage', () => {
    const emit = vi.fn();
    const { getUsage, handler } = buildCodexEventHandler(
      { emit },
      {
        provider: 'codex',
        sessionId: 'session-1',
      },
    );

    handler({
      type: 'turn.completed',
      usage: {
        input_tokens: 18100,
        cached_input_tokens: 8900,
        output_tokens: 250,
      },
    });

    expect(getUsage()).toEqual({ inputTokens: 18100, outputTokens: 250 });
  });
});
