// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FilePicker } from './FilePicker';

// FilePicker renders null when closed — verify it doesn't throw.
describe('FilePicker', () => {
  it('exports a FilePicker function component', () => {
    expect(typeof FilePicker).toBe('function');
  });

  it('returns null when isOpen is false', () => {
    // Direct function call would fail (useState requires a React renderer).
    // Use render() and verify nothing is mounted in the DOM.
    const { container } = render(
      <FilePicker
        isOpen={false}
        onClose={vi.fn()}
        projectRoot={null}
        onSelectFile={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
