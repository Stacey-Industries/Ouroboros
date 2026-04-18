/**
 * ThinkingVerbList.test.tsx
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThinkingVerbList } from './ThinkingVerbList';

afterEach(cleanup);

describe('ThinkingVerbList', () => {
  it('renders the provided verbs as chips', () => {
    render(<ThinkingVerbList verbs={['thinking', 'pondering']} onChange={vi.fn()} />);
    expect(screen.getByTestId('verb-chip-thinking')).toBeTruthy();
    expect(screen.getByTestId('verb-chip-pondering')).toBeTruthy();
  });

  it('falls back to DEFAULT_THINKING_VERBS when verbs is empty', () => {
    render(<ThinkingVerbList verbs={[]} onChange={vi.fn()} />);
    // "thinking" is the first default verb
    expect(screen.getByTestId('verb-chip-thinking')).toBeTruthy();
  });

  it('calls onChange without the removed verb when × is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={['thinking', 'pondering']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('remove-verb-thinking'));
    expect(onChange).toHaveBeenCalledWith(['pondering']);
  });

  it('adds a new verb when Add is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={['thinking']} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('verb-input'), { target: { value: 'musing' } });
    fireEvent.click(screen.getByTestId('verb-add-btn'));
    expect(onChange).toHaveBeenCalledWith(['thinking', 'musing']);
  });

  it('adds a verb on Enter key', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={['thinking']} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('verb-input'), { target: { value: 'cogitating' } });
    fireEvent.keyDown(screen.getByTestId('verb-input'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['thinking', 'cogitating']);
  });

  it('does not add a duplicate verb', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={['thinking']} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('verb-input'), { target: { value: 'thinking' } });
    fireEvent.click(screen.getByTestId('verb-add-btn'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add an empty verb', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={['thinking']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('verb-add-btn'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('trims and lowercases the input before adding', () => {
    const onChange = vi.fn();
    render(<ThinkingVerbList verbs={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('verb-input'), { target: { value: '  Musing  ' } });
    fireEvent.click(screen.getByTestId('verb-add-btn'));
    expect(onChange).toHaveBeenCalledWith(['musing']);
  });

  it('clears the input after a successful add', () => {
    render(<ThinkingVerbList verbs={[]} onChange={vi.fn()} />);
    const input = screen.getByTestId('verb-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'musing' } });
    fireEvent.click(screen.getByTestId('verb-add-btn'));
    expect(input.value).toBe('');
  });
});
