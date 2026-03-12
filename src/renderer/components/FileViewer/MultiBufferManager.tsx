import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  memo,
} from 'react';
import type { BufferExcerpt, MultiBufferConfig } from '../../types/electron';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiBufferTab {
  id: string;
  config: MultiBufferConfig;
  /** Loaded file contents keyed by file path */
  fileContents: Map<string, { content: string | null; isLoading: boolean; error: string | null }>;
}

interface MultiBufferState {
  multiBuffers: MultiBufferTab[];
  openMultiBuffer: (config?: MultiBufferConfig) => string;
  closeMultiBuffer: (id: string) => void;
  addExcerpt: (id: string, excerpt: BufferExcerpt) => void;
  removeExcerpt: (id: string, excerptIndex: number) => void;
  renameMultiBuffer: (id: string, name: string) => void;
}

const MultiBufferContext = createContext<MultiBufferState | null>(null);

let nextId = 1;
function generateId(): string {
  return `mb-${nextId++}-${Date.now()}`;
}

// ─── Provider ───────────────────────────────────────────────────────────────

export interface MultiBufferManagerProps {
  children: React.ReactNode;
}

export function MultiBufferManager({ children }: MultiBufferManagerProps): React.ReactElement {
  const [multiBuffers, setMultiBuffers] = useState<MultiBufferTab[]>([]);

  // Load file content for an excerpt
  const loadFileContent = useCallback(async (filePath: string, mbId: string) => {
    // Mark as loading
    setMultiBuffers((prev) =>
      prev.map((mb) => {
        if (mb.id !== mbId) return mb;
        const next = new Map(mb.fileContents);
        if (!next.has(filePath)) {
          next.set(filePath, { content: null, isLoading: true, error: null });
        }
        return { ...mb, fileContents: next };
      }),
    );

    try {
      const result = await window.electronAPI.files.readFile(filePath);
      setMultiBuffers((prev) =>
        prev.map((mb) => {
          if (mb.id !== mbId) return mb;
          const next = new Map(mb.fileContents);
          if (result.success) {
            next.set(filePath, { content: result.content ?? '', isLoading: false, error: null });
          } else {
            next.set(filePath, { content: null, isLoading: false, error: result.error ?? 'Failed to read file' });
          }
          return { ...mb, fileContents: next };
        }),
      );
    } catch (err) {
      setMultiBuffers((prev) =>
        prev.map((mb) => {
          if (mb.id !== mbId) return mb;
          const next = new Map(mb.fileContents);
          next.set(filePath, { content: null, isLoading: false, error: String(err) });
          return { ...mb, fileContents: next };
        }),
      );
    }
  }, []);

  const openMultiBuffer = useCallback((config?: MultiBufferConfig): string => {
    const id = generateId();
    const cfg = config ?? { name: 'Untitled Multi-Buffer', excerpts: [] };
    const tab: MultiBufferTab = {
      id,
      config: cfg,
      fileContents: new Map(),
    };
    setMultiBuffers((prev) => [...prev, tab]);

    // Load content for any pre-existing excerpts
    if (cfg.excerpts.length > 0) {
      const uniquePaths = [...new Set(cfg.excerpts.map((e) => e.filePath))];
      for (const fp of uniquePaths) {
        void loadFileContent(fp, id);
      }
    }

    return id;
  }, [loadFileContent]);

  const closeMultiBuffer = useCallback((id: string) => {
    setMultiBuffers((prev) => prev.filter((mb) => mb.id !== id));
  }, []);

  const addExcerpt = useCallback((id: string, excerpt: BufferExcerpt) => {
    setMultiBuffers((prev) =>
      prev.map((mb) => {
        if (mb.id !== id) return mb;
        return {
          ...mb,
          config: {
            ...mb.config,
            excerpts: [...mb.config.excerpts, excerpt],
          },
        };
      }),
    );
    // Load file content if not already loaded
    void loadFileContent(excerpt.filePath, id);
  }, [loadFileContent]);

  const removeExcerpt = useCallback((id: string, excerptIndex: number) => {
    setMultiBuffers((prev) =>
      prev.map((mb) => {
        if (mb.id !== id) return mb;
        const excerpts = mb.config.excerpts.filter((_, i) => i !== excerptIndex);
        return {
          ...mb,
          config: { ...mb.config, excerpts },
        };
      }),
    );
  }, []);

  const renameMultiBuffer = useCallback((id: string, name: string) => {
    setMultiBuffers((prev) =>
      prev.map((mb) => {
        if (mb.id !== id) return mb;
        return { ...mb, config: { ...mb.config, name } };
      }),
    );
  }, []);

  // Listen for agent-ide:open-multi-buffer DOM CustomEvents
  useEffect(() => {
    function onOpenMultiBuffer(e: Event): void {
      const detail = (e as CustomEvent<MultiBufferConfig | undefined>).detail;
      openMultiBuffer(detail);
    }

    window.addEventListener('agent-ide:open-multi-buffer', onOpenMultiBuffer);
    return () => window.removeEventListener('agent-ide:open-multi-buffer', onOpenMultiBuffer);
  }, [openMultiBuffer]);

  const value: MultiBufferState = {
    multiBuffers,
    openMultiBuffer,
    closeMultiBuffer,
    addExcerpt,
    removeExcerpt,
    renameMultiBuffer,
  };

  return (
    <MultiBufferContext.Provider value={value}>
      {children}
    </MultiBufferContext.Provider>
  );
}

export function useMultiBufferManager(): MultiBufferState {
  const ctx = useContext(MultiBufferContext);
  if (!ctx) {
    throw new Error('useMultiBufferManager must be used inside <MultiBufferManager>');
  }
  return ctx;
}

// ─── Add Excerpt Form ───────────────────────────────────────────────────────

export interface AddExcerptFormProps {
  onAdd: (excerpt: BufferExcerpt) => void;
  onCancel: () => void;
}

export const AddExcerptForm = memo(function AddExcerptForm({
  onAdd,
  onCancel,
}: AddExcerptFormProps): React.ReactElement {
  const [filePath, setFilePath] = useState('');
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('50');
  const [label, setLabel] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) return;
    const start = parseInt(startLine, 10);
    const end = parseInt(endLine, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) return;

    onAdd({
      filePath: filePath.trim(),
      startLine: start,
      endLine: end,
      label: label.trim() || undefined,
    });
  }, [filePath, startLine, endLine, label, onAdd]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    color: 'var(--text)',
    padding: '4px 8px',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-ui)',
    marginBottom: '2px',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
        Add Excerpt
      </div>

      <div>
        <div style={labelStyle}>File path (absolute)</div>
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="/path/to/file.ts"
          style={inputStyle}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Start line</div>
          <input
            type="number"
            value={startLine}
            onChange={(e) => setStartLine(e.target.value)}
            min="1"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>End line</div>
          <input
            type="number"
            value={endLine}
            onChange={(e) => setEndLine(e.target.value)}
            min="1"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <div style={labelStyle}>Label (optional)</div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. handleClick"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            color: 'var(--text-muted)',
            padding: '4px 12px',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '3px',
            color: 'var(--bg)',
            padding: '4px 12px',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
          }}
        >
          Add
        </button>
      </div>
    </form>
  );
});
