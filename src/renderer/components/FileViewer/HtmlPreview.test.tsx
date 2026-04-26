/**
 * @vitest-environment jsdom
 *
 * HtmlPreview tests — sandbox flags, source generation, navigation blocking.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import { HtmlPreview } from './HtmlPreview';

describe('HtmlPreview', () => {
  describe('sandbox flags', () => {
    it('renders an iframe with empty sandbox attribute', () => {
      const { container } = render(<HtmlPreview content="<p>hello</p>" />);
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      // sandbox="" — no permissions at all
      expect(iframe?.getAttribute('sandbox')).toBe('');
    });

    it('does not include allow-scripts in sandbox', () => {
      const { container } = render(<HtmlPreview content="<script>alert(1)</script>" />);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).not.toContain('allow-scripts');
    });

    it('does not include allow-same-origin in sandbox', () => {
      const { container } = render(<HtmlPreview content="<p>x</p>" />);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).not.toContain('allow-same-origin');
    });

    it('does not include allow-top-navigation in sandbox', () => {
      const { container } = render(<HtmlPreview content="<p>x</p>" />);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).not.toContain('allow-top-navigation');
    });

    it('does not include allow-popups in sandbox', () => {
      const { container } = render(<HtmlPreview content="<p>x</p>" />);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).not.toContain('allow-popups');
    });

    it('does not include allow-forms in sandbox', () => {
      const { container } = render(<HtmlPreview content="<form><input /></form>" />);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).not.toContain('allow-forms');
    });
  });

  describe('srcDoc content delivery', () => {
    it('passes content via srcDoc, not src', () => {
      const html = '<h1>Test</h1>';
      const { container } = render(<HtmlPreview content={html} />);
      const iframe = container.querySelector('iframe');
      expect(iframe?.getAttribute('srcdoc')).toBe(html);
      expect(iframe?.getAttribute('src')).toBeNull();
    });

    it('reflects updated content when prop changes', () => {
      const { container, rerender } = render(<HtmlPreview content="<p>first</p>" />);
      rerender(<HtmlPreview content="<p>second</p>" />);
      const iframe = container.querySelector('iframe');
      expect(iframe?.getAttribute('srcdoc')).toBe('<p>second</p>');
    });
  });

  describe('limitation banner', () => {
    it('renders a limitation notice about sandboxed assets', () => {
      const { container } = render(<HtmlPreview content="<p>x</p>" />);
      // Find the banner div by its role="note" attribute directly
      const notes = container.querySelectorAll('[role="note"]');
      expect(notes.length).toBeGreaterThan(0);
      const banner = notes[0];
      expect(banner.textContent).toMatch(/relative assets/i);
      expect(banner.textContent).toMatch(/scripts are disabled/i);
    });
  });

  describe('empty content', () => {
    it('shows error view when content is empty string', () => {
      render(<HtmlPreview content="" />);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/no html content/i);
    });

    it('does not render an iframe when content is empty', () => {
      const { container } = render(<HtmlPreview content="" />);
      expect(container.querySelector('iframe')).toBeNull();
    });
  });

  describe('file path label', () => {
    it('sets iframe title to include filePath when provided', () => {
      const { container } = render(
        <HtmlPreview content="<p>x</p>" filePath="/project/index.html" />,
      );
      const iframe = container.querySelector('iframe');
      expect(iframe?.getAttribute('title')).toContain('index.html');
    });

    it('uses generic title when filePath is not provided', () => {
      const { container } = render(<HtmlPreview content="<p>x</p>" />);
      const iframe = container.querySelector('iframe');
      expect(iframe?.getAttribute('title')).toBe('HTML preview');
    });
  });

  describe('navigation blocking', () => {
    it('has no href-based src attribute that could trigger navigation', () => {
      const { container } = render(<HtmlPreview content="<a href='https://evil.com'>click</a>" />);
      const iframe = container.querySelector('iframe');
      // Navigation is blocked at the sandbox level — verify iframe has no src
      expect(iframe?.getAttribute('src')).toBeNull();
    });
  });
});
