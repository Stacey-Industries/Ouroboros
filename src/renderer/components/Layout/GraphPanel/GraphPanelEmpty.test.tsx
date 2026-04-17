/**
 * GraphPanelEmpty.test.tsx — smoke tests for the empty/loading state component.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GraphPanelEmpty } from './GraphPanelEmpty';

afterEach(cleanup);

describe('GraphPanelEmpty', () => {
  it('shows loading text when loading=true', () => {
    render(<GraphPanelEmpty loading />);
    expect(screen.getByText('Loading graph…')).toBeTruthy();
  });

  it('shows unavailable text when loading=false (default)', () => {
    render(<GraphPanelEmpty />);
    expect(screen.getByText('Graph not available')).toBeTruthy();
  });

  it('shows index hint when not loading', () => {
    render(<GraphPanelEmpty />);
    expect(screen.getByText(/Index the project/)).toBeTruthy();
  });

  it('does not show index hint when loading', () => {
    render(<GraphPanelEmpty loading />);
    expect(screen.queryByText(/Index the project/)).toBeNull();
  });
});
