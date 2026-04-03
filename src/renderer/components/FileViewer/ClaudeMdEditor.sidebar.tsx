import React, { memo } from 'react';

import {
  CLAUDE_MD_TEMPLATES,
  type ClaudeMdSection,
  type ClaudeMdTemplate,
  SECTION_ICONS,
  SIDEBAR_ADD_SECTION_LABEL_STYLE,
  SIDEBAR_ADD_SECTION_WRAPPER_STYLE,
  SIDEBAR_TEMPLATE_CARD_STYLE,
  SIDEBAR_TEMPLATE_CARD_TITLE_STYLE,
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

const SECTION_ICON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  width: '14px',
  textAlign: 'center',
  fontSize: '0.625rem',
  opacity: 0.7,
};

function getSectionRowStyle(level: number): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '4px 10px',
    paddingLeft: `${10 + (level - 1) * 12}px`,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.6875rem',
    lineHeight: '1.4',
  };
}

function getSectionLabelStyle(level: number): React.CSSProperties {
  return {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: level <= 2 ? 600 : 400,
  };
}

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
      style={getSectionRowStyle(section.level)}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = 'var(--border-semantic)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span style={SECTION_ICON_STYLE}>{SECTION_ICONS[section.type]}</span>
      <span style={getSectionLabelStyle(section.level)}>{section.title}</span>
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
        event.currentTarget.style.color = 'var(--text-primary)';
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

const TemplatePreview = memo(function TemplatePreview({
  content,
}: {
  content: string;
}): React.ReactElement {
  return (
    <pre className="text-text-semantic-muted" style={previewStyle}>
      {content.slice(0, 200)}
    </pre>
  );
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
    <div style={SIDEBAR_TEMPLATE_CARD_STYLE}>
      <div className="text-text-semantic-primary" style={SIDEBAR_TEMPLATE_CARD_TITLE_STYLE}>
        {template.name}
      </div>
      <TemplatePreview content={template.content} />
      <InsertTemplateButton
        onInsertTemplate={onInsertTemplate}
        templateContent={template.content}
      />
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
    return (
      <div
        className="text-text-semantic-muted"
        style={{ padding: '12px 10px', fontStyle: 'italic' }}
      >
        No headings found
      </div>
    );
  }
  return (
    <>
      {sections.map((section) => (
        <SectionRow
          key={`${section.startLine}-${section.title}`}
          onSelect={onSelectSection}
          section={section}
        />
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
    <div style={SIDEBAR_ADD_SECTION_WRAPPER_STYLE}>
      <div className="text-text-semantic-muted" style={SIDEBAR_ADD_SECTION_LABEL_STYLE}>
        Add Section
      </div>
      {CLAUDE_MD_TEMPLATES.map((template) => (
        <TemplateMenuButton
          key={template.name}
          onInsertTemplate={onInsertTemplate}
          template={template}
        />
      ))}
    </div>
  );
});

type OutlineSidebarProps = {
  onInsertTemplate: (t: string) => void;
  onSelectSection: (s: ClaudeMdSection) => void;
  sections: ClaudeMdSection[];
};
export const ClaudeMdOutlineSidebar = memo(function ClaudeMdOutlineSidebar({
  onInsertTemplate,
  onSelectSection,
  sections,
}: OutlineSidebarProps): React.ReactElement {
  return (
    <aside style={sidebarStyle}>
      <div className="text-text-semantic-muted" style={sectionTitleStyle}>
        Sections
      </div>
      <SectionOutline onSelectSection={onSelectSection} sections={sections} />
      <AddSectionMenu onInsertTemplate={onInsertTemplate} />
    </aside>
  );
});

type TemplateLibraryProps = { onInsertTemplate: (t: string) => void };
export const ClaudeMdTemplateLibrary = memo(function ClaudeMdTemplateLibrary({
  onInsertTemplate,
}: TemplateLibraryProps): React.ReactElement {
  return (
    <aside style={panelStyle}>
      <div className="text-text-semantic-muted" style={sectionTitleStyle}>
        Template Library
      </div>
      {CLAUDE_MD_TEMPLATES.map((template) => (
        <TemplateCard key={template.name} onInsertTemplate={onInsertTemplate} template={template} />
      ))}
    </aside>
  );
});
