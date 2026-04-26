/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminalSearchBar } from './SearchBar';

// ─── Mock SearchAddon ────────────────────────────────────────────────────────

function makeMockSearchAddon() {
  return {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    onDidChangeResults: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

afterEach(() => cleanup());

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TerminalSearchBar', () => {
  it('renders the search input', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search...')).toBeDefined();
  });

  it('renders prev, next, and close buttons', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    expect(screen.getByTitle('Previous match (Shift+Enter)')).toBeDefined();
    expect(screen.getByTitle('Next match (Enter)')).toBeDefined();
    expect(screen.getByTitle('Close (Escape)')).toBeDefined();
  });

  it('close button calls clearDecorations and onClose', () => {
    const addon = makeMockSearchAddon();
    const onClose = vi.fn();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Close (Escape)'));
    expect(addon.clearDecorations).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('typing in input calls findNext with query value', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(addon.findNext).toHaveBeenCalledWith('hello');
  });

  it('clearing input calls clearDecorations', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(addon.clearDecorations).toHaveBeenCalled();
  });

  it('Escape key calls clearDecorations and onClose', () => {
    const addon = makeMockSearchAddon();
    const onClose = vi.fn();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={onClose} />);
    const container = screen.getByPlaceholderText('Search...').closest('div');
    fireEvent.keyDown(container!, { key: 'Escape' });
    expect(addon.clearDecorations).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter key calls findNext', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'foo' } });
    const container = input.closest('div');
    fireEvent.keyDown(container!, { key: 'Enter' });
    expect(addon.findNext).toHaveBeenCalledWith('foo');
  });

  it('Shift+Enter key calls findPrevious', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'foo' } });
    const container = input.closest('div');
    fireEvent.keyDown(container!, { key: 'Enter', shiftKey: true });
    expect(addon.findPrevious).toHaveBeenCalledWith('foo');
  });

  it('subscribes to onDidChangeResults on mount', () => {
    const addon = makeMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    expect(addon.onDidChangeResults).toHaveBeenCalled();
  });

  it('disposes onDidChangeResults subscription on unmount', () => {
    const dispose = vi.fn();
    const addon = { ...makeMockSearchAddon(), onDidChangeResults: vi.fn(() => ({ dispose })) };
    const { unmount } = render(<TerminalSearchBar searchAddon={addon as never} onClose={vi.fn()} />);
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
