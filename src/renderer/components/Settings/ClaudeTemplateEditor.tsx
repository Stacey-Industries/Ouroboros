import React from 'react';

import type { AgentTemplate } from '../../types/electron';
import {
  claudeTemplateAddButtonStyle,
  claudeTemplateButtonRowStyle,
  claudeTemplateCancelButtonStyle,
  claudeTemplateEditCardStyle,
  claudeTemplateHeaderRowStyle,
  claudeTemplateHelpCodeStyle,
  claudeTemplateHelpTextStyle,
  claudeTemplateIconButtonStyle,
  claudeTemplateIconInputStyle,
  claudeTemplateIconPreviewStyle,
  claudeTemplateListStyle,
  claudeTemplateSaveButtonStyle,
  claudeTemplateTemplateNameStyle,
  claudeTemplateTemplatePromptStyle,
  claudeTemplateTemplateRowStyle,
  claudeTemplateTemplateTextStyle,
  claudeTemplateTextareaStyle,
  claudeTemplateTextInputStyle,
} from './claudeTemplateEditorStyles';
import { SectionLabel } from './settingsStyles';
import {
  type TemplateEditorModel,
  useTemplateEditorModel,
} from './useClaudeTemplateEditor';

interface ClaudeTemplateEditorProps {
  templates: AgentTemplate[];
  onChange: (templates: AgentTemplate[]) => void;
}

interface TemplateListItemProps {
  model: TemplateEditorModel;
  template: AgentTemplate;
}

interface IconButtonProps {
  ariaLabel: string;
  children: React.ReactNode;
  color?: string;
  onClick: () => void;
  title: string;
}

export function ClaudeTemplateEditor({
  templates,
  onChange,
}: ClaudeTemplateEditorProps): React.ReactElement<any> {
  const model = useTemplateEditorModel(templates, onChange);
  return (
    <section>
      <SectionLabel>Agent Templates</SectionLabel>
      <TemplateHelpText />
      <div style={claudeTemplateListStyle}>
        {templates.map((template) => (
          <TemplateListItem key={template.id} model={model} template={template} />
        ))}
      </div>
      <button onClick={model.addTemplate} className="text-text-semantic-primary" style={claudeTemplateAddButtonStyle}>
        + Add Template
      </button>
    </section>
  );
}

function TemplateListItem({
  model,
  template,
}: TemplateListItemProps): React.ReactElement<any> {
  if (model.editingId === template.id) {
    return <EditableTemplateCard model={model} />;
  }

  return <TemplateRow model={model} template={template} />;
}

function EditableTemplateCard({
  model,
}: {
  model: TemplateEditorModel;
}): React.ReactElement<any> {
  return (
    <div style={claudeTemplateEditCardStyle}>
      <EditableTemplateFields model={model} />
      <EditableTemplateActions model={model} />
    </div>
  );
}

function EditableTemplateFields({
  model,
}: {
  model: TemplateEditorModel;
}): React.ReactElement<any> {
  return (
    <>
      <div style={claudeTemplateHeaderRowStyle}>
        <input
          type="text"
          value={model.editDraft.icon ?? ''}
          onChange={(event) => model.updateDraft('icon', event.target.value)}
          placeholder="Icon"
          aria-label="Template icon"
          className="text-text-semantic-primary"
          style={claudeTemplateIconInputStyle}
        />
        <input
          type="text"
          value={model.editDraft.name ?? ''}
          onChange={(event) => model.updateDraft('name', event.target.value)}
          placeholder="Template name"
          aria-label="Template name"
          className="text-text-semantic-primary"
          style={{ ...claudeTemplateTextInputStyle, flex: 1 }}
        />
      </div>
      <textarea
        value={model.editDraft.promptTemplate ?? ''}
        onChange={(event) => model.updateDraft('promptTemplate', event.target.value)}
        placeholder="Prompt template (supports {{variables}})"
        aria-label="Prompt template"
        rows={3}
        className="text-text-semantic-primary"
        style={claudeTemplateTextareaStyle}
      />
    </>
  );
}

function EditableTemplateActions({
  model,
}: {
  model: TemplateEditorModel;
}): React.ReactElement<any> {
  return (
    <div style={claudeTemplateButtonRowStyle}>
      <button onClick={model.cancelEdit} className="text-text-semantic-primary" style={claudeTemplateCancelButtonStyle}>
        Cancel
      </button>
      <button onClick={model.saveEdit} className="text-text-semantic-on-accent" style={claudeTemplateSaveButtonStyle}>
        Save
      </button>
    </div>
  );
}

function TemplateRow({
  model,
  template,
}: TemplateListItemProps): React.ReactElement<any> {
  return (
    <div style={claudeTemplateTemplateRowStyle}>
      {template.icon && <span style={claudeTemplateIconPreviewStyle}>{template.icon}</span>}
      <div style={claudeTemplateTemplateTextStyle}>
        <div className="text-text-semantic-primary" style={claudeTemplateTemplateNameStyle}>{template.name}</div>
        <div className="text-text-semantic-muted" style={claudeTemplateTemplatePromptStyle} title={template.promptTemplate}>
          {template.promptTemplate}
        </div>
      </div>
      <IconButton
        ariaLabel={`Edit ${template.name}`}
        onClick={() => model.startEdit(template)}
        title="Edit"
      >
        <EditIcon />
      </IconButton>
      <IconButton
        ariaLabel={`Delete ${template.name}`}
        color="var(--error, #ef4444)"
        onClick={() => model.deleteTemplate(template.id)}
        title="Delete"
      >
        <DeleteIcon />
      </IconButton>
    </div>
  );
}

function IconButton({
  ariaLabel,
  children,
  color,
  onClick,
  title,
}: IconButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={color ? undefined : 'text-text-semantic-muted'}
      style={color ? { ...claudeTemplateIconButtonStyle, color } : claudeTemplateIconButtonStyle}
      title={title}
    >
      {children}
    </button>
  );
}

function TemplateHelpText(): React.ReactElement<any> {
  return (
    <p className="text-text-semantic-muted" style={claudeTemplateHelpTextStyle}>
      Quick-launch profiles for common tasks. Use{' '}
      <code className="text-interactive-accent" style={claudeTemplateHelpCodeStyle}>{'{{openFile}}'}</code>,{' '}
      <code className="text-interactive-accent" style={claudeTemplateHelpCodeStyle}>{'{{projectRoot}}'}</code>,{' '}
      <code className="text-interactive-accent" style={claudeTemplateHelpCodeStyle}>{'{{projectName}}'}</code> as variables in
      prompts.
    </p>
  );
}

function EditIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 2L10 10M10 2L2 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
