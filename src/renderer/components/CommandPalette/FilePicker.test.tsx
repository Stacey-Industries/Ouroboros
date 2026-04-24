import { describe, expect, it, vi } from 'vitest';

import { FilePicker } from './FilePicker';

// FilePicker renders null when closed — verify it doesn't throw.
describe('FilePicker', () => {
  it('exports a FilePicker function component', () => {
    expect(typeof FilePicker).toBe('function');
  });

  it('returns null when isOpen is false (no DOM render needed)', () => {
    // Call the component directly as a function to test the early-return guard
    // without needing full electron API mock or DOM setup.
    const result = FilePicker({
      isOpen: false,
      onClose: vi.fn(),
      projectRoot: null,
      onSelectFile: vi.fn(),
    });
    expect(result).toBeNull();
  });
});
