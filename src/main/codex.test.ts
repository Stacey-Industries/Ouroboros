import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCodexModels } from './codex';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

describe('listCodexModels', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
  });

  it('includes gpt-5.5 with every Codex effort level in the fallback catalog', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('no cache'));

    const models = await listCodexModels();
    const model = models.find((entry) => entry.id === 'gpt-5.5');

    expect(model).toEqual(
      expect.objectContaining({
        id: 'gpt-5.5',
        name: 'gpt-5.5',
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
      }),
    );
  });
});
