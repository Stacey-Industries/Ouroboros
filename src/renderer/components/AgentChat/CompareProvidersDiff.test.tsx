/**
 * CompareProvidersDiff.test.tsx — Wave 36 Phase F
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompareProvidersDiff } from './CompareProvidersDiff';

afterEach(cleanup);

describe('CompareProvidersDiff', () => {
  it('renders legend labels for both providers', () => {
    render(
      <CompareProvidersDiff
        textA="hello world"
        textB="hello earth"
        labelA="Claude"
        labelB="Codex"
      />,
    );
    expect(screen.getByText(/Claude only/)).toBeTruthy();
    expect(screen.getByText(/Codex only/)).toBeTruthy();
  });

  it('shows "No output to diff yet" when both texts are empty', () => {
    render(
      <CompareProvidersDiff textA="" textB="" labelA="A" labelB="B" />,
    );
    expect(screen.getByText(/No output to diff yet/)).toBeTruthy();
  });

  it('renders diff tokens for differing text', () => {
    render(
      <CompareProvidersDiff
        textA="the cat sat"
        textB="the dog sat"
        labelA="A"
        labelB="B"
      />,
    );
    // shared words are rendered somewhere in the document
    expect(screen.getByText('the')).toBeTruthy();
    expect(screen.getByText('sat')).toBeTruthy();
  });

  it('renders without crashing for identical texts', () => {
    render(
      <CompareProvidersDiff
        textA="same text here"
        textB="same text here"
        labelA="A"
        labelB="B"
      />,
    );
    // all tokens should be present and no error thrown
    expect(screen.getByText('same')).toBeTruthy();
  });
});
