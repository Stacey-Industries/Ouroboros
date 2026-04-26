import React from 'react';

import {
  claudeSectionAddButtonStyle,
  claudeSectionAddDirectoryRowStyle,
  claudeSectionDirectoryListStyle,
  claudeSectionDirectoryRowStyle,
  claudeSectionDirectoryTextStyle,
  claudeSectionRemoveDirectoryButtonStyle,
  claudeSectionSectionDescriptionStyle,
  claudeSectionTextInputStyle,
} from './claudeSectionContentStyles';
import { ToggleSection } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';
import type { CodexSectionModel } from './useCodexSection';

function DirectoryList({ model }: { model: CodexSectionModel }): React.ReactElement | null {
  if (model.settings.addDirs.length === 0) return null;
  return (
    <div style={claudeSectionDirectoryListStyle}>
      {model.settings.addDirs.map((directory, index) => (
        <div key={`${directory}-${index}`} style={claudeSectionDirectoryRowStyle}>
          <span className="text-text-semantic-primary" style={claudeSectionDirectoryTextStyle}>
            {directory}
          </span>
          <button
            onClick={() => model.removeDir(index)}
            aria-label={`Remove ${directory}`}
            className="text-text-semantic-muted"
            style={claudeSectionRemoveDirectoryButtonStyle}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

export function AdditionalDirectoriesSection({
  model,
}: {
  model: CodexSectionModel;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Additional Directories</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Extra directories Codex can write to in addition to the primary workspace.
      </p>
      <DirectoryList model={model} />
      <div style={claudeSectionAddDirectoryRowStyle}>
        <input
          type="text"
          value={model.newDir}
          onChange={(event) => model.setNewDir(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              model.addDir();
            }
          }}
          placeholder="/path/to/directory"
          aria-label="New Codex directory path"
          className="text-text-semantic-primary"
          style={{ ...claudeSectionTextInputStyle, flex: 1 }}
        />
        <button
          onClick={model.addDir}
          disabled={!model.canAddDir}
          style={claudeSectionAddButtonStyle(model.canAddDir)}
        >
          Add
        </button>
      </div>
    </section>
  );
}

function SkipGitRepoCheckSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <ToggleSection
      checked={model.settings.skipGitRepoCheck}
      description="Allow Codex to run even when the selected folder is not a git repository."
      label="Skip git repo check"
      title="Skip Git Repo Check"
      onChange={(value) => model.updateSetting('skipGitRepoCheck', value)}
    />
  );
}

export function WorkspaceSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <>
      <AdditionalDirectoriesSection model={model} />
      <SkipGitRepoCheckSection model={model} />
    </>
  );
}
