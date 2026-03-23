import { useState } from 'react';

import type { AgentTemplate } from '../../types/electron';

export interface TemplateEditorModel {
  editDraft: Partial<AgentTemplate>;
  editingId: string | null;
  addTemplate: () => void;
  cancelEdit: () => void;
  deleteTemplate: (id: string) => void;
  saveEdit: () => void;
  startEdit: (template: AgentTemplate) => void;
  updateDraft: (key: keyof AgentTemplate, value: string) => void;
}

interface RemoveTemplateOptions {
  cancelEdit: () => void;
  editingId: string | null;
  id: string;
  onChange: (templates: AgentTemplate[]) => void;
  templates: AgentTemplate[];
}

interface ApplyTemplateEditOptions {
  cancelEdit: () => void;
  editDraft: Partial<AgentTemplate>;
  editingId: string | null;
  onChange: (templates: AgentTemplate[]) => void;
  templates: AgentTemplate[];
}

export function useTemplateEditorModel(
  templates: AgentTemplate[],
  onChange: (templates: AgentTemplate[]) => void,
): TemplateEditorModel {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AgentTemplate>>({});
  const cancelEdit = (): void => {
    setEditingId(null);
    setEditDraft({});
  };
  const addTemplate = (): void => startNewTemplate(templates, onChange, setEditingId, setEditDraft);
  const deleteTemplate = (id: string): void => removeTemplate({ cancelEdit, editingId, id, onChange, templates });
  const startEdit = (template: AgentTemplate): void => {
    setEditingId(template.id);
    setEditDraft({ ...template });
  };
  const saveEdit = (): void => applyTemplateEdit({ cancelEdit, editDraft, editingId, onChange, templates });
  const updateDraft = (key: keyof AgentTemplate, value: string): void =>
    setEditDraft((currentDraft) => ({ ...currentDraft, [key]: value }));

  return {
    editDraft,
    editingId,
    addTemplate,
    cancelEdit,
    deleteTemplate,
    saveEdit,
    startEdit,
    updateDraft,
  };
}

function startNewTemplate(
  templates: AgentTemplate[],
  onChange: (templates: AgentTemplate[]) => void,
  setEditingId: (id: string) => void,
  setEditDraft: (template: AgentTemplate) => void,
): void {
  const template = createTemplate();
  onChange([...templates, template]);
  setEditingId(template.id);
  setEditDraft(template);
}

function removeTemplate({
  cancelEdit,
  editingId,
  id,
  onChange,
  templates,
}: RemoveTemplateOptions): void {
  onChange(templates.filter((template) => template.id !== id));
  if (editingId === id) cancelEdit();
}

function applyTemplateEdit({
  cancelEdit,
  editDraft,
  editingId,
  onChange,
  templates,
}: ApplyTemplateEditOptions): void {
  if (!editingId) return;
  onChange(templates.map((template) => updateTemplate(template, editingId, editDraft)));
  cancelEdit();
}

function createTemplate(): AgentTemplate {
  return {
    id: `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'New Template',
    icon: '',
    promptTemplate: '',
  };
}

function updateTemplate(
  template: AgentTemplate,
  editingId: string,
  editDraft: Partial<AgentTemplate>,
): AgentTemplate {
  if (template.id !== editingId) return template;
  return { ...template, ...editDraft };
}
