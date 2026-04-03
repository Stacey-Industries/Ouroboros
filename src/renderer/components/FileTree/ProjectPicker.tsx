import React from 'react';

import { ProjectPickerMenu, ProjectPickerToggle } from './ProjectPickerMenu';
import { useProjectPickerController } from './useProjectPickerController';

export interface ProjectPickerProps {
  currentPath: string | null;
  recentProjects: string[];
  onSelectProject: (path: string) => void;
  onAddProject?: (path: string) => void;
  rootCount?: number;
}

export function ProjectPicker({
  currentPath,
  recentProjects,
  onSelectProject,
  onAddProject,
  rootCount = 0,
}: ProjectPickerProps): React.ReactElement {
  const controller = useProjectPickerController({
    currentPath,
    recentProjects,
    onSelectProject,
    onAddProject,
    rootCount,
  });

  return (
    <div ref={controller.containerRef as React.RefObject<HTMLDivElement | null>} style={{ position: 'relative', width: '100%' }}>
      <ProjectPickerToggle
        busy={controller.busy}
        currentPath={currentPath}
        hasMultipleRoots={controller.hasMultipleRoots}
        open={controller.open}
        projectName={controller.projectName}
        rootCount={controller.rootCount}
        onToggle={controller.toggleOpen}
      />
      {controller.open && (
        <ProjectPickerMenu
          canAddProject={controller.canAddProject}
          recents={controller.recents}
          rootCount={controller.rootCount}
          onAddFolder={controller.addFolder}
          onOpenFolder={controller.openFolder}
          onSelectRecent={controller.selectRecent}
        />
      )}
    </div>
  );
}
