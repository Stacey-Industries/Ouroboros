/**
 * SessionGroupHeader.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => { cleanup(); });

import { SessionGroupHeader } from './SessionGroupHeader';

describe('SessionGroupHeader', () => {
  it('renders the project name', () => {
    render(<SessionGroupHeader projectName="my-project" count={3} />);
    expect(screen.getByText('my-project')).toBeTruthy();
  });

  it('renders the session count', () => {
    render(<SessionGroupHeader projectName="alpha" count={7} />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('uses singular label for count of 1', () => {
    render(<SessionGroupHeader projectName="beta" count={1} />);
    expect(screen.getByLabelText('1 session')).toBeTruthy();
  });

  it('uses plural label for count > 1', () => {
    render(<SessionGroupHeader projectName="gamma" count={4} />);
    expect(screen.getByLabelText('4 sessions')).toBeTruthy();
  });

  it('has a rowheader aria-label containing the project name', () => {
    render(<SessionGroupHeader projectName="delta" count={2} />);
    expect(screen.getByRole('rowheader', { name: /delta/i })).toBeTruthy();
  });

  it('sets title on the name span for overflow tooltip', () => {
    render(<SessionGroupHeader projectName="long-project-name" count={1} />);
    expect(screen.getByTitle('long-project-name')).toBeTruthy();
  });
});
