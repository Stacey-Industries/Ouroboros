/**
 * FlowSearchBar.tsx — Natural-language search input for the Flow Tracer.
 *
 * Wave 85 Phase 6. Renders a search <input> + submit button and a
 * disambiguation dropdown when resolution confidence is ≤ 0.8.
 *
 * The component is self-contained: it drives useNLResolve internally
 * and calls onResolve(entryPoint) when the user selects a result
 * (either direct high-confidence resolve or a disambiguation pick).
 *
 * Does NOT call runTrace itself — the parent (FlowTracerView) wires
 * onResolve to its traceFlow handler.
 */

import React, { useCallback, useRef, useState } from 'react';

import type { EntryPointCandidate, SymbolRef } from '../../../shared/types/flowTracer';
import { useNLResolve } from './useNLResolve';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FlowSearchBarProps {
  /** Called when a symbol has been selected (high-confidence or disambiguation pick). */
  onResolve: (entryPoint: SymbolRef) => void;
  /** Optional placeholder text for the search input. */
  placeholder?: string;
  /** Disable the control while an upstream operation is in progress. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// DisambiguationList
// ---------------------------------------------------------------------------

interface DisambiguationListProps {
  matches: EntryPointCandidate[];
  onSelect: (candidate: EntryPointCandidate) => void;
}

function DisambiguationList({ matches, onSelect }: DisambiguationListProps): React.ReactElement {
  return (
    <ul
      role="listbox"
      aria-label="Disambiguation options"
      className="mt-1 rounded border border-border-semantic bg-surface-overlay shadow-md"
    >
      {matches.map((candidate) => (
        <li key={`${candidate.file}:${candidate.line}`} role="option" aria-selected={false}>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-surface-hover focus:bg-surface-hover text-sm"
            onClick={() => onSelect(candidate)}
          >
            <span className="block font-mono text-text-semantic-primary truncate">
              {candidate.symbol}
            </span>
            <span className="block text-xs text-text-semantic-muted truncate">
              {candidate.file}:{candidate.line}
            </span>
            <span className="block text-xs text-text-semantic-secondary mt-0.5 italic">
              {candidate.reason}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// SearchForm — the input row
// ---------------------------------------------------------------------------

interface SearchFormProps {
  value: string;
  disabled: boolean;
  loading: boolean;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function SearchForm({
  value,
  disabled,
  loading,
  placeholder,
  onChange,
  onSubmit,
  inputRef,
}: SearchFormProps): React.ReactElement {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 items-center">
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Search flows by natural language"
        className="flex-1 px-3 py-1.5 text-sm rounded border border-border-semantic bg-surface-inset text-text-semantic-primary placeholder:text-text-semantic-faint focus:outline-none focus:border-border-accent disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="px-3 py-1.5 text-sm rounded bg-interactive-accent text-text-on-accent hover:bg-interactive-hover disabled:opacity-50 shrink-0"
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// FlowSearchBar — coordinator
// ---------------------------------------------------------------------------

interface HandlerOpts {
  inputValue: string;
  setInputValue: (v: string) => void;
  onResolve: (ep: SymbolRef) => void;
  resolveQuery: ReturnType<typeof useNLResolve>['resolveQuery'];
  reset: ReturnType<typeof useNLResolve>['reset'];
  stateStatus: ReturnType<typeof useNLResolve>['state']['status'];
}

function useSearchBarHandlers(opts: HandlerOpts) {
  const { inputValue, setInputValue, onResolve, resolveQuery, reset, stateStatus } = opts;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const query = inputValue.trim();
      if (!query) return;
      resolveQuery(query).then((result) => {
        if (!result) return;
        if (result.confidence > 0.8 && result.matches.length > 0) {
          const top = result.matches[0];
          onResolve({ symbol: top.symbol, file: top.file, line: top.line });
        }
      });
    },
    [inputValue, onResolve, resolveQuery],
  );

  const handleDisambiguationSelect = useCallback(
    (candidate: EntryPointCandidate) => {
      onResolve({ symbol: candidate.symbol, file: candidate.file, line: candidate.line });
      reset();
      setInputValue('');
    },
    [onResolve, reset, setInputValue],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (stateStatus !== 'idle' && stateStatus !== 'loading') reset();
    },
    [reset, setInputValue, stateStatus],
  );

  return { handleSubmit, handleDisambiguationSelect, handleInputChange };
}

export function FlowSearchBar({
  onResolve,
  placeholder = 'e.g. "when I send a chat message"',
  disabled = false,
}: FlowSearchBarProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, resolveQuery, reset } = useNLResolve();

  const isLoading = state.status === 'loading';
  const { handleSubmit, handleDisambiguationSelect, handleInputChange } = useSearchBarHandlers({
    inputValue,
    setInputValue,
    onResolve,
    resolveQuery,
    reset,
    stateStatus: state.status,
  });

  return (
    <div className="flex flex-col gap-1 w-full">
      <SearchForm
        value={inputValue}
        disabled={disabled || isLoading}
        loading={isLoading}
        placeholder={placeholder}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        inputRef={inputRef}
      />
      {state.status === 'disambiguation' && (
        <DisambiguationList matches={state.matches} onSelect={handleDisambiguationSelect} />
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-status-error mt-0.5">
          {state.message}
        </p>
      )}
    </div>
  );
}
