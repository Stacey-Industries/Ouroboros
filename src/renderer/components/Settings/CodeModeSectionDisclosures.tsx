import React from 'react';

import { SectionLabel } from './CodeModeSection.shared';
import type { CodeModeSectionModel } from './useCodeModeSectionModel';

function CollapseChevron({ isOpen }: { isOpen: boolean }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="text-text-semantic-muted"
      style={{
        fontSize: '10px',
        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        display: 'inline-block',
      }}
    >
      &gt;
    </span>
  );
}

export function CollapsibleSection({
  children,
  isOpen,
  onToggle,
  title,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
}): React.ReactElement {
  return (
    <section>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          marginBottom: isOpen ? '12px' : 0,
        }}
      >
        <SectionLabel style={{ marginBottom: 0 }}>{title}</SectionLabel>
        <CollapseChevron isOpen={isOpen} />
      </button>
      {isOpen ? children : null}
    </section>
  );
}

export function GeneratedTypesContent({
  generatedTypes,
  isEnabled,
}: Pick<CodeModeSectionModel, 'generatedTypes' | 'isEnabled'>): React.ReactElement {
  if (!generatedTypes) {
    return (
      <p
        className="text-text-semantic-muted"
        style={{ fontSize: '12px', fontStyle: 'italic', margin: 0 }}
      >
        {isEnabled
          ? 'No types generated yet.'
          : 'Enable Code Mode to generate TypeScript types for your MCP servers.'}
      </p>
    );
  }

  return (
    <pre
      className="text-text-semantic-secondary"
      style={{
        background: 'var(--surface-base)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-default)',
        overflowX: 'auto',
        maxHeight: '300px',
        overflowY: 'auto',
        margin: 0,
        lineHeight: 1.6,
        whiteSpace: 'pre',
      }}
    >
      {generatedTypes}
    </pre>
  );
}

export function HowItWorksContent(): React.ReactElement {
  return (
    <ol
      className="text-text-semantic-muted"
      style={{
        margin: 0,
        paddingLeft: '20px',
        fontSize: '12px',
        lineHeight: 1.8,
      }}
    >
      <li>Connects to upstream MCP servers you specify</li>
      <li>Introspects their tool schemas and generates TypeScript type definitions</li>
      <li>
        Exposes a single{' '}
        <code className="text-text-semantic-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
          execute_code
        </code>{' '}
        tool to Claude
      </li>
      <li>
        Claude writes TypeScript code against the typed API instead of calling N individual tools
      </li>
      <li>
        Code Mode executes the code in a sandboxed VM, dispatching calls to the real MCP servers
      </li>
    </ol>
  );
}
