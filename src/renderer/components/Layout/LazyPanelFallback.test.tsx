/**
 * Smoke tests for LazyPanelFallback.
 *
 * Vitest runs in Node environment (no DOM), so we verify the component
 * can be imported and is a valid React function component.
 */

import { describe, expect, it } from 'vitest';

import { LazyPanelFallback } from './LazyPanelFallback';

describe('LazyPanelFallback', () => {
  it('is a function (React function component)', () => {
    expect(typeof LazyPanelFallback).toBe('function');
  });

  it('has the correct display name', () => {
    expect(LazyPanelFallback.name).toBe('LazyPanelFallback');
  });
});
