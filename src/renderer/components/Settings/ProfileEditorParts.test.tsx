/**
 * ProfileEditorParts.test.tsx — Smoke tests for ProfileEditorParts sub-components.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import {
  FieldRow,
  FieldsProps,
  McpChecklist,
  ProfileEditorFields,
  ProfileEditorTextFields,
  SegmentedControl,
  ToolsChecklist,
} from './ProfileEditorParts';

afterEach(cleanup);

// ─── Minimal electronAPI stub ─────────────────────────────────────────────────

function stubElectronAPI(multiProvider = false): void {
  Object.assign(window, {
    electronAPI: {
      config: {
        getAll: vi.fn().mockResolvedValue({ providers: { multiProvider } }),
      },
      providers: {
        checkAllAvailability: vi.fn().mockResolvedValue({
          success: true,
          availability: { claude: true, codex: false, gemini: false },
        }),
      },
    },
  });
}

const NOOP_SET = vi.fn() as unknown as FieldsProps['set'];

const BASE_DRAFT: Partial<Profile> = {
  id: 'test-id',
  name: 'Test',
  effort: 'medium',
  permissionMode: 'normal',
};

// ─── FieldRow ─────────────────────────────────────────────────────────────────

describe('FieldRow', () => {
  it('renders label and children', () => {
    render(<FieldRow label="My Label"><span>child content</span></FieldRow>);
    expect(screen.getByText('My Label')).toBeTruthy();
    expect(screen.getByText('child content')).toBeTruthy();
  });
});

// ─── SegmentedControl ─────────────────────────────────────────────────────────

describe('SegmentedControl', () => {
  it('renders all options', () => {
    const options = [
      { value: 'low' as const, label: 'Low' },
      { value: 'medium' as const, label: 'Medium' },
      { value: 'high' as const, label: 'High' },
    ];
    render(<SegmentedControl options={options} value="medium" onChange={vi.fn()} />);
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('calls onChange with selected value', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'low' as const, label: 'Low' },
      { value: 'high' as const, label: 'High' },
    ];
    render(<SegmentedControl options={options} value="low" onChange={onChange} />);
    fireEvent.click(screen.getByText('High'));
    expect(onChange).toHaveBeenCalledWith('high');
  });
});

// ─── ToolsChecklist ───────────────────────────────────────────────────────────

describe('ToolsChecklist', () => {
  it('renders all tools as checkboxes', () => {
    render(<ToolsChecklist enabled={undefined} onChange={vi.fn()} />);
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText('Bash')).toBeTruthy();
  });

  it('calls onChange when a tool is toggled off', () => {
    const onChange = vi.fn();
    render(<ToolsChecklist enabled={['Read', 'Write']} onChange={onChange} />);
    const readLabel = screen.getByText('Read').closest('label') as HTMLElement;
    fireEvent.click(readLabel.querySelector('input') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(['Write']);
  });

  it('calls onChange when an unchecked tool is toggled on', () => {
    const onChange = vi.fn();
    render(<ToolsChecklist enabled={[]} onChange={onChange} />);
    const bashLabel = screen.getByText('Bash').closest('label') as HTMLElement;
    fireEvent.click(bashLabel.querySelector('input') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(['Bash']);
  });
});

// ─── McpChecklist ─────────────────────────────────────────────────────────────

describe('McpChecklist', () => {
  it('renders nothing when servers list is empty', () => {
    const { container } = render(
      <McpChecklist servers={[]} enabled={undefined} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders server names as checkboxes', () => {
    render(
      <McpChecklist servers={['myServer', 'otherServer']} enabled={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText('myServer')).toBeTruthy();
    expect(screen.getByText('otherServer')).toBeTruthy();
  });

  it('calls onChange when a server is toggled on', () => {
    const onChange = vi.fn();
    render(<McpChecklist servers={['myServer']} enabled={[]} onChange={onChange} />);
    const label = screen.getByText('myServer').closest('label') as HTMLElement;
    fireEvent.click(label.querySelector('input') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(['myServer']);
  });
});

// ─── ProfileEditorTextFields ──────────────────────────────────────────────────

describe('ProfileEditorTextFields', () => {
  it('renders name, description, model, effort and permission fields', () => {
    render(<ProfileEditorTextFields draft={BASE_DRAFT} set={NOOP_SET} />);
    expect(screen.getByPlaceholderText('Profile name')).toBeTruthy();
    expect(screen.getByPlaceholderText('Optional description')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();
  });

  it('reflects draft name value', () => {
    render(<ProfileEditorTextFields draft={BASE_DRAFT} set={NOOP_SET} />);
    const nameInput = screen.getByPlaceholderText('Profile name') as HTMLInputElement;
    expect(nameInput.value).toBe('Test');
  });
});

// ─── ProfileEditorFields ──────────────────────────────────────────────────────

describe('ProfileEditorFields', () => {
  it('renders text fields and tools checklist', () => {
    stubElectronAPI(false);
    render(
      <ProfileEditorFields
        draft={BASE_DRAFT}
        mcpServers={[]}
        multiProvider={false}
        set={NOOP_SET}
      />,
    );
    expect(screen.getByPlaceholderText('Profile name')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
  });

  it('renders MCP section when servers are provided', () => {
    stubElectronAPI(false);
    render(
      <ProfileEditorFields
        draft={BASE_DRAFT}
        mcpServers={['srv1']}
        multiProvider={false}
        set={NOOP_SET}
      />,
    );
    expect(screen.getByText('srv1')).toBeTruthy();
  });

  it('hides MCP section when servers list is empty', () => {
    stubElectronAPI(false);
    render(
      <ProfileEditorFields
        draft={BASE_DRAFT}
        mcpServers={[]}
        multiProvider={false}
        set={NOOP_SET}
      />,
    );
    expect(screen.queryByText('MCP servers')).toBeNull();
  });
});
