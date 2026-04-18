/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeImportModalBody } from './ThemeImportModalBody';

afterEach(cleanup);

const noop = (): void => { /* no-op */ };

describe('ThemeImportModalBody', () => {
  it('renders Paste JSON tab with textarea by default', () => {
    const { container } = render(
      <ThemeImportModalBody
        activeTab="paste"
        pasteValue=""
        error={null}
        onTabChange={noop}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('renders upload file input when activeTab is upload', () => {
    const { container } = render(
      <ThemeImportModalBody
        activeTab="upload"
        pasteValue=""
        error={null}
        onTabChange={noop}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('calls onTabChange("upload") when Upload file tab is clicked', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <ThemeImportModalBody
        activeTab="paste"
        pasteValue=""
        error={null}
        onTabChange={onTabChange}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Upload file',
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    expect(onTabChange).toHaveBeenCalledWith('upload');
  });

  it('calls onTabChange("paste") when Paste JSON tab is clicked', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <ThemeImportModalBody
        activeTab="upload"
        pasteValue=""
        error={null}
        onTabChange={onTabChange}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    const pasteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Paste JSON',
    ) as HTMLButtonElement;
    fireEvent.click(pasteBtn);
    expect(onTabChange).toHaveBeenCalledWith('paste');
  });

  it('calls onPasteChange when textarea value changes', () => {
    const onPasteChange = vi.fn();
    const { container } = render(
      <ThemeImportModalBody
        activeTab="paste"
        pasteValue=""
        error={null}
        onTabChange={noop}
        onPasteChange={onPasteChange}
        onFileLoad={noop}
      />,
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"colors":{}}' } });
    expect(onPasteChange).toHaveBeenCalledWith('{"colors":{}}');
  });

  it('displays error message when error is provided', () => {
    const { container } = render(
      <ThemeImportModalBody
        activeTab="paste"
        pasteValue=""
        error="Invalid JSON: could not parse the provided string."
        onTabChange={noop}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Invalid JSON');
  });

  it('does not render error element when error is null', () => {
    const { container } = render(
      <ThemeImportModalBody
        activeTab="paste"
        pasteValue=""
        error={null}
        onTabChange={noop}
        onPasteChange={noop}
        onFileLoad={noop}
      />,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
