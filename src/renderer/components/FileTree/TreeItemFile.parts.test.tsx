// @vitest-environment jsdom
/**
 * TreeItemFile.parts.test.tsx — smoke tests for TreeItemFile.parts.tsx
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  DiagnosticIndicator,
  DirtyDot,
  HeatDot,
  HighlightedName,
  NestChevron,
  SearchPath,
  StatusBadge,
} from './TreeItemFile.parts';

describe('HighlightedName', () => {
  it('renders plain name when no ranges', () => {
    render(<HighlightedName name="foo.ts" />);
    expect(screen.getByText('foo.ts')).toBeTruthy();
  });

  it('highlights matched ranges', () => {
    const { container } = render(
      <HighlightedName name="foo.ts" ranges={[{ start: 0, end: 3 }]} />,
    );
    const highlighted = container.querySelector('.text-interactive-accent');
    expect(highlighted?.textContent).toBe('foo');
  });
});

describe('StatusBadge', () => {
  it('renders label', () => {
    render(<StatusBadge label="M" />);
    expect(screen.getByText('M')).toBeTruthy();
  });
});

describe('SearchPath', () => {
  it('returns null when no directory separator', () => {
    const { container } = render(<SearchPath relativePath="file.ts" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders directory portion', () => {
    render(<SearchPath relativePath="src/foo/bar.ts" />);
    expect(screen.getByText('src/foo')).toBeTruthy();
  });
});

describe('HeatDot', () => {
  it('renders without glow', () => {
    const { container } = render(<HeatDot color="red" glow={false} />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.boxShadow).toBe('');
  });
});

describe('NestChevron', () => {
  it('renders expanded state', () => {
    const { container } = render(<NestChevron expanded={true} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});

describe('DiagnosticIndicator', () => {
  it('returns null for unknown severity', () => {
    const { container } = render(<DiagnosticIndicator severity="unknown" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error indicator', () => {
    const { container } = render(<DiagnosticIndicator severity="error" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders warning as triangle svg', () => {
    const { container } = render(<DiagnosticIndicator severity="warning" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('DirtyDot', () => {
  it('renders with unsaved changes title', () => {
    const { container } = render(<DirtyDot />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('title')).toBe('Unsaved changes');
  });
});
