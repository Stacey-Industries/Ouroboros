import React, { memo } from 'react';
import {
  CLAUDE_MD_TEMPLATES,
  SECTION_ICONS,
  type ClaudeMdSection,
  type ClaudeMdTemplate,
} from './ClaudeMdEditor.utils';

const sidebarStyle: React.CSSProperties = {
  width: '200px',
  flexShrink: 0,
  borderRight: '1px solid var(--border-semantic)',
  backgroundColor: 'var(--surface-base)',
  overflow: 'auto',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
};

const panelStyle: React.CSSProperties = {
  width: '240px',
  flexShrink: 0,
  borderLeft: '1px solid var(--border-semantic)',
  backgroundColor: 'var(--surface-base)',
  overflow: 'auto',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
};

const sectionTitleStyle: React.CSSProperties = {
  padding: '8px 10px 4px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: '0.625rem',
};

const insertButtonStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '0.625rem',
  fontFamily: 'var(--font-ui)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
};

const previewStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.5625rem',
  lineHeight: '1.4',
  whiteSpace: 'pre-wrap',
  margin: '0 0 6px',
  maxHeight: '80px',
  overflow: 'hidden',
};

const SectionRow = memo(function SectionRow({
  onSelect,
  section,
}: {
  onSelect: (section: ClaudeMdSection) => void;
  section: ClaudeMdSection;
}): React.ReactElement {
  return (
    <button
      onClick={() => onSelect(section)}
      title={`Line ${section.startLine + 1}: ${section.title}`}
      className="text-text-semantic-primary"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        padding: '4px 10px',
        paddingLeft: `${10 + (section.level - 1) * 12}px`,
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.6875rem',
        lineHeight: '1.4',
      }}
      onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--border-semantic)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span style={{ flexShrink: 0, width: '14px', textAlign: 'center', fontSize: '0.625rem', opacity: 0.7 }}>{SECTION_ICONS[section.type]}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: section.level <= 2 ? 600 : 400 }}>
        {section.title}
      </span>
    </button>
  );
});

const TemplateMenuButton = memo(function TemplateMenuButton({
  onInsertTemplate,
  template,
}: {
  onInsertTemplate: (templateContent: string) => void;
  template: ClaudeMdTemplate;
}): React.ReactElement {
  return (
    <button
      onClick={() => onInsertTemplate(template.content)}
      className="text-text-semantic-muted"
      style={{
        display: 'block',
        width: '100%',
        padding: '3px 6px',
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.625rem',
        lineHeight: '1.5',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = 'var(--border-semantic)';
        event.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent';
        event.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      + {template.name}
    </button>
  );
});

const TemplatePreview = memo(function TemplatePreview({ content }: { content: string }): React.ReactElement {
  return <pre className="text-text-semantic-muted" style={previewStyle}>{content.slice(0, 200)}</pre>;
});

const InsertTemplateButton = memo(function InsertTemplateButton({
  onInsertTemplate,
  templateContent,
}: {
  onInsertTemplate: (templateContent: string) => void;
  templateContent: string;
}): React.ReactElement {
  return (
    <button
      onClick={() => onInsertTemplate(templateContent)}
      className="text-interactive-accent"
      style={insertButtonStyle}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = 'var(--interactive-accent)';
        event.currentTarget.style.color = 'var(--text-on-accent)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent';
        event.currentTarget.style.color = 'var(--interactive-accent)';
      }}
    >
      Insert
    </button>
  );
});

const TemplateCard = memo(function TemplateCard({
  onInsertTemplate,
  template,
}: {
  onInsertTemplate: (templateContent: string) => void;
  template: ClaudeMdTemplate;
}): React.ReactElement {
  return (
    <div
      style={{
        margin: '6px 8px',
        padding: '8px 10px',
        border: '1px solid var(--border-semantic)',
        borderRadius: '6px',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="text-text-semantic-primary" style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.6875rem' }}>{template.name}</div>
      <TemplatePreview content={template.content} />
      <InsertTemplateButton onInsertTemplate={onInsertTemplate} templateContent={template.content} />
    </div>
  );
});

const SectionOutline = memo(function SectionOutline({
  onSelectSection,
  sections,
}: {
  onSelectSection: (section: ClaudeMdSection) => void;
  sections: ClaudeMdSection[];
}): React.ReactElement {
  if (sections.length === 0) {
    return <div className="text-text-semantic-muted" style={{ padding: '12px 10px', fontStyle: 'italic' }}>No headings found</div>;
  }
  return (
    <>
      {sections.map((section) => (
        <SectionRow key={`${section.startLine}-${section.title}`} onSelect={onSelectSection} section={section} />
      ))}
    </>
  );
});

const AddSectionMenu = memo(function AddSectionMenu({
  onInsertTemplate,
}: {
  onInsertTemplate: (templateContent: string) => void;
}): React.ReactElement {
  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-semantic)', marginTop: '4px' }}>
      <div className="text-text-semantic-muted" style={{ ...sectionTitleStyle, padding: 0, marginBottom: '4px' }}>Add Section</div>
      {CLAUDE_MD_TEMPLATES.map((template) => (
        <TemplateMenuButton key={template.name} onInsertTemplate={onInsertTemplate} template={template} />
      ))}
    </div>
  );
});

export const ClaudeMdOutlineSidebar = memo(function ClaudeMdOutlineSidebar({
  onInsertTemplate,
  onSelectSection,
  sections,
}: {
  onInsertTemplate: (templateContent: string) => void;
  onSelectSection: (section: ClaudeMdSection) => void;
  sections: ClaudeMdSection[];
}): React.ReactElement {
  return (
    <aside style={sidebarStyle}>
      <div className="text-text-semantic-muted" style={sectionTitleStyle}>Sections</div>
      <SectionOutline onSelectSection={onSelectSection} sections={sections} />
      <AddSectionMenu onInsertTemplate={onInsertTemplate} />
    </aside>
  );
});

export const ClaudeMdTemplateLibrary = memo(function ClaudeMdTemplateLibrary({
  onInsertTemplate,
}: {
  onInsertTemplate: (templateContent: string) => void;
}): React.ReactElement {
  return (
    <aside style={panelStyle}>
      <div className="text-text-semantic-muted" style={sectionTitleStyle}>Template Library</div>
      {CLAUDE_MD_TEMPLATES.map((template) => (
        <TemplateCard key={template.name} onInsertTemplate={onInsertTemplate} template={template} />
      ))}
    </aside>
  );
});
