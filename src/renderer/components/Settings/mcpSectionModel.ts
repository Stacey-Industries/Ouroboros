import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { MCP_SERVERS_CHANGED_EVENT } from '../../hooks/appEventNames';
import type { McpServerEntry } from '../../types/electron';
import { EMPTY_FORM, configToForm, formToConfig, type ServerFormState } from './mcpHelpers';

export interface FormHandlers {
  onFieldChange: (field: keyof ServerFormState, value: string) => void;
  onScopeChange: (scope: 'global' | 'project') => void;
  onAddEnvRow: () => void;
  onRemoveEnvRow: (idx: number) => void;
  onUpdateEnvRow: (idx: number, field: 'key' | 'value', val: string) => void;
}

export interface McpSectionModel {
  actionError: string | null;
  confirmDelete: string | null;
  editingServer: string | null;
  error: string | null;
  form: ServerFormState;
  formHandlers: FormHandlers;
  globalServers: McpServerEntry[];
  isAdding: boolean;
  loading: boolean;
  projectServers: McpServerEntry[];
  refresh: () => Promise<void>;
  removeServer: (name: string, scope: 'global' | 'project') => Promise<void>;
  servers: McpServerEntry[];
  startAdd: () => void;
  startEdit: (server: McpServerEntry) => void;
  toggleServer: (server: McpServerEntry) => Promise<void>;
  updateServer: () => Promise<void>;
  addServer: () => Promise<void>;
  cancelDelete: () => void;
  cancelForm: () => void;
  markForDelete: (id: string) => void;
}

interface McpServerData {
  actionError: string | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  servers: McpServerEntry[];
  setActionError: Dispatch<SetStateAction<string | null>>;
}

interface McpEditorState {
  confirmDelete: string | null;
  editingServer: string | null;
  form: ServerFormState;
  isAdding: boolean;
  cancelDelete: () => void;
  cancelForm: () => void;
  markForDelete: (id: string) => void;
  setConfirmDelete: Dispatch<SetStateAction<string | null>>;
  setEditingServer: Dispatch<SetStateAction<string | null>>;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
  setIsAdding: Dispatch<SetStateAction<boolean>>;
  startAdd: () => void;
  startEdit: (server: McpServerEntry) => void;
}

export function useMcpSectionModel(): McpSectionModel {
  const data = useMcpServerData();
  const editor = useMcpEditorState();
  const formHandlers = buildFormHandlers(editor.setForm);
  const addServer = useAddServerAction(data, editor);
  const updateServer = useUpdateServerAction(data, editor);
  const toggleServer = useToggleServerAction(data);
  const removeServer = useRemoveServerAction(data, editor);
  const globalServers = data.servers.filter((server) => server.scope === 'global');
  const projectServers = data.servers.filter((server) => server.scope === 'project');

  return { ...data, ...editor, addServer, formHandlers, globalServers, projectServers, removeServer, toggleServer, updateServer };
}

function useMcpServerData(): McpServerData {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.mcp.getServers();
      if (result.success && result.servers) setServers(result.servers);
      else setError(result.error ?? 'Failed to load MCP servers');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Auto-refresh when MCP store installs/changes a server
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener(MCP_SERVERS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(MCP_SERVERS_CHANGED_EVENT, handler);
  }, [refresh]);

  useEffect(() => {
    if (!actionError) return;
    const timeout = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timeout);
  }, [actionError]);

  return { actionError, error, loading, refresh, servers, setActionError };
}

function useMcpEditorState(): McpEditorState {
  const [isAdding, setIsAdding] = useState(false);
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function cancelForm(): void {
    setIsAdding(false);
    setEditingServer(null);
    setForm(EMPTY_FORM);
  }

  function startAdd(): void {
    setEditingServer(null);
    setForm(EMPTY_FORM);
    setIsAdding(true);
  }

  function startEdit(server: McpServerEntry): void {
    setIsAdding(false);
    setEditingServer(server.name);
    setForm(configToForm(server.name, server));
  }

  return {
    confirmDelete,
    editingServer,
    form,
    isAdding,
    cancelDelete: () => setConfirmDelete(null),
    cancelForm,
    markForDelete: (id) => setConfirmDelete(id),
    setConfirmDelete,
    setEditingServer,
    setForm,
    setIsAdding,
    startAdd,
    startEdit,
  };
}

function useAddServerAction(data: McpServerData, editor: McpEditorState): McpSectionModel['addServer'] {
  return async function addServer(): Promise<void> {
    if (!editor.form.name.trim()) return data.setActionError('Server name is required.');
    if (!hasCommandOrUrl(editor.form)) return data.setActionError('Either command or URL is required.');
    try {
      const result = await window.electronAPI.mcp.addServer(editor.form.name.trim(), formToConfig(editor.form), editor.form.scope);
      if (!result.success) return data.setActionError(result.error ?? 'Failed to add server');
      editor.setIsAdding(false);
      editor.setForm(EMPTY_FORM);
      await data.refresh();
    } catch (err) {
      data.setActionError(err instanceof Error ? err.message : 'Failed to add server');
    }
  };
}

function useUpdateServerAction(data: McpServerData, editor: McpEditorState): McpSectionModel['updateServer'] {
  return async function updateServer(): Promise<void> {
    if (!editor.editingServer) return;
    if (!hasCommandOrUrl(editor.form)) return data.setActionError('Either command or URL is required.');
    try {
      const result = await window.electronAPI.mcp.updateServer(editor.editingServer, formToConfig(editor.form), editor.form.scope);
      if (!result.success) return data.setActionError(result.error ?? 'Failed to update server');
      editor.setEditingServer(null);
      editor.setForm(EMPTY_FORM);
      await data.refresh();
    } catch (err) {
      data.setActionError(err instanceof Error ? err.message : 'Failed to update server');
    }
  };
}

function useToggleServerAction(data: McpServerData): McpSectionModel['toggleServer'] {
  return async function toggleServer(server: McpServerEntry): Promise<void> {
    try {
      const result = await window.electronAPI.mcp.toggleServer(server.name, !server.enabled, server.scope);
      if (!result.success) return data.setActionError(result.error ?? 'Failed to toggle');
      await data.refresh();
    } catch (err) {
      data.setActionError(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };
}

function useRemoveServerAction(data: McpServerData, editor: McpEditorState): McpSectionModel['removeServer'] {
  return async function removeServer(name: string, scope: 'global' | 'project'): Promise<void> {
    try {
      const result = await window.electronAPI.mcp.removeServer(name, scope);
      if (!result.success) return data.setActionError(result.error ?? 'Failed to remove');
      editor.setConfirmDelete(null);
      if (editor.editingServer === name) {
        editor.setEditingServer(null);
        editor.setForm(EMPTY_FORM);
      }
      await data.refresh();
    } catch (err) {
      data.setActionError(err instanceof Error ? err.message : 'Failed to remove');
    }
  };
}

function buildFormHandlers(setForm: Dispatch<SetStateAction<ServerFormState>>): FormHandlers {
  return {
    onFieldChange: (field, value) => setForm((form) => ({ ...form, [field]: value })),
    onScopeChange: (scope) => setForm((form) => ({ ...form, scope })),
    onAddEnvRow: () => setForm((form) => ({ ...form, envRows: [...form.envRows, { key: '', value: '' }] })),
    onRemoveEnvRow: (idx) => setForm((form) => ({ ...form, envRows: form.envRows.filter((_, rowIndex) => rowIndex !== idx) })),
    onUpdateEnvRow: (idx, field, val) => setForm((form) => ({
      ...form,
      envRows: form.envRows.map((row, rowIndex) => (rowIndex === idx ? { ...row, [field]: val } : row)),
    })),
  };
}

function hasCommandOrUrl(form: ServerFormState): boolean {
  return Boolean(form.command.trim() || form.url.trim());
}
