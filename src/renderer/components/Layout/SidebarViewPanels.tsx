/**
 * SidebarViewPanels — placeholder panels for non-file sidebar views.
 *
 * These are rendered inside the Sidebar when the activity bar switches
 * away from the default "files" view.
 */

import React from 'react';

function PlaceholderPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center select-none">
      <span className="text-sm font-medium mb-2 text-text-semantic-primary">
        {title}
      </span>
      <span className="text-xs text-text-semantic-muted">
        {message}
      </span>
    </div>
  );
}

export function SearchPanel(): React.ReactElement {
  return (
    <PlaceholderPanel
      title="Search"
      message="Project-wide file content search coming soon."
    />
  );
}

export function GitSidebarPanel(): React.ReactElement {
  return (
    <PlaceholderPanel
      title="Source Control"
      message="Git status and changes panel coming soon."
    />
  );
}

export function ExtensionsPanel(): React.ReactElement {
  return (
    <PlaceholderPanel
      title="Extensions"
      message="Extensions and plugins panel coming soon."
    />
  );
}
