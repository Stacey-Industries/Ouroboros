import React from 'react';
import { SectionLabel } from './settingsStyles';

const ACTIVATION_EVENTS = [
  { event: '*', description: 'activate on startup' },
  { event: 'onStartup', description: 'same as *' },
  { event: 'onFileOpen', description: 'any file opened' },
  { event: 'onFileOpen:*.ts', description: 'TypeScript file opened' },
  { event: 'onLanguage:python', description: 'Python file active' },
  { event: 'onCommand:cmdId', description: 'command invoked' },
  { event: 'onSessionStart', description: 'Claude session starts' },
  { event: 'onSessionEnd', description: 'Claude session ends' },
  { event: 'onTerminalCreate', description: 'terminal created' },
  { event: 'onGitCommit', description: 'git commit made' },
];

const VALID_PERMISSIONS = [
  'files.read',
  'files.write',
  'terminal.write',
  'config.read',
  'config.write',
  'ui.notify',
  'commands.register',
];

const MANIFEST_SNIPPET = `{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Your Name",
  "main": "index.js",
  "permissions": ["files.read", "config.read", "ui.notify"],
  "activationEvents": ["onFileOpen:*.ts", "onSessionStart"]
}`;

const INDEX_SNIPPET = `// Available API (based on permissions):
// ouroboros.files.readFile(path)
// ouroboros.files.writeFile(path, content)
// ouroboros.terminal.write(tabId, data)
// ouroboros.config.get(key)
// ouroboros.ui.showNotification(message)
// ouroboros.commands.register(id, handler)

console.log('My extension loaded!');
ouroboros.ui.showNotification('Hello from my extension!');`;

interface ExtensionsBuildGuideProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ExtensionsBuildGuide({
  isOpen,
  onToggle,
}: ExtensionsBuildGuideProps): React.ReactElement {
  return (
    <section>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={guideToggleStyle(isOpen)}
      >
        <SectionLabel style={{ marginBottom: 0 }}>How to Build an Extension</SectionLabel>
        <span className="text-text-semantic-muted" style={guideArrowStyle(isOpen)}>{'\u25B6'}</span>
      </button>
      {isOpen && <BuildGuideContent />}
    </section>
  );
}

function BuildGuideContent(): React.ReactElement {
  return (
    <>
      <GuideDescription />
      <SectionLabel style={{ marginBottom: '4px' }}>manifest.json</SectionLabel>
      <CodeBlock code={MANIFEST_SNIPPET} />
      <SectionLabel style={{ marginBottom: '4px' }}>Activation Events</SectionLabel>
      <EventBadgeList />
      <ActivationHelp />
      <SectionLabel style={{ marginBottom: '4px' }}>index.js</SectionLabel>
      <CodeBlock code={INDEX_SNIPPET} />
      <PermissionsList />
      <SandboxNote />
    </>
  );
}

function GuideDescription(): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={guideTextStyle}>
      Create a folder with a <code className="text-text-semantic-secondary" style={inlineCodeStyle}>manifest.json</code> and a JavaScript
      entry file, then install via &quot;Install from Folder&quot; or copy directly to the
      extensions directory.
    </p>
  );
}

function EventBadgeList(): React.ReactElement {
  return (
    <div style={badgeListStyle}>
      {ACTIVATION_EVENTS.map(({ event, description }) => (
        <span key={event} title={description} className="text-text-semantic-secondary" style={guideBadgeStyle}>
          {event}
        </span>
      ))}
    </div>
  );
}

function ActivationHelp(): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={guideTextStyle}>
      Extensions without <code className="text-text-semantic-secondary" style={inlineCodeStyle}>activationEvents</code> activate on
      startup (backward compatible). Extensions with specific events remain &quot;pending&quot;
      until the matching event fires.
    </p>
  );
}

function PermissionsList(): React.ReactElement {
  return (
    <>
      <p className="text-text-semantic-muted" style={{ ...guideTextStyle, marginBottom: '6px' }}>
        <strong className="text-text-semantic-primary">Valid permissions:</strong>
      </p>
      <div style={{ ...badgeListStyle, marginBottom: '6px' }}>
        {VALID_PERMISSIONS.map((permission) => (
          <code key={permission} className="text-text-semantic-secondary" style={permissionCodeStyle}>
            {permission}
          </code>
        ))}
      </div>
    </>
  );
}

function SandboxNote(): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={{ ...guideTextStyle, marginTop: '8px', marginBottom: 0 }}>
      Extensions run in a sandboxed VM with no access to{' '}
      <code className="text-text-semantic-secondary" style={inlineCodeStyle}>require()</code>,{' '}
      <code className="text-text-semantic-secondary" style={inlineCodeStyle}>process</code>, or the filesystem directly. All capabilities
      are gated by the permissions declared in the manifest.
    </p>
  );
}

function CodeBlock({ code }: { code: string }): React.ReactElement {
  return <pre className="text-text-semantic-secondary" style={codeBlockStyle}>{code}</pre>;
}

function guideToggleStyle(isOpen: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    marginBottom: isOpen ? '12px' : 0,
  };
}

function guideArrowStyle(isOpen: boolean): React.CSSProperties {
  return {
    fontSize: '10px',
    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 150ms ease',
    display: 'inline-block',
  };
}

const badgeListStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
  marginBottom: '12px',
};

const codeBlockStyle: React.CSSProperties = {
  background: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  overflowX: 'auto',
  margin: '0 0 12px 0',
  lineHeight: 1.6,
  whiteSpace: 'pre',
};

const guideBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 6px',
  borderRadius: '3px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontFamily: 'var(--font-mono)',
  cursor: 'help',
};

const guideTextStyle: React.CSSProperties = {
  fontSize: '12px',
  marginBottom: '10px',
};

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
};

const permissionCodeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '3px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontFamily: 'var(--font-mono)',
};
