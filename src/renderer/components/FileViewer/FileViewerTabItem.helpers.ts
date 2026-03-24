import { useCallback, useState } from 'react';
import React from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { type DirtyCloseChoice, finalizeDirtyCloseChoice } from './dirtyCloseFlow';
import type { OpenFile } from './FileViewerManager';
import { useFileViewerManager } from './FileViewerManager';
import type { ContextMenuState } from './FileViewerTabItem.parts';

export function useTabActions({
  file,
  onActivate,
  onRequestClose,
  onPin,
}: {
  file: OpenFile;
  onActivate: (filePath: string) => void;
  onRequestClose: () => void;
  onPin?: (filePath: string) => void;
}) {
  const handleActivate = useCallback(() => onActivate(file.path), [file.path, onActivate]);
  const handleDoubleClick = useCallback(() => {
    if (file.isPreview && onPin) onPin(file.path);
  }, [file.isPreview, file.path, onPin]);
  const handleAuxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      onRequestClose();
    },
    [onRequestClose],
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') handleActivate();
    },
    [handleActivate],
  );
  return { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown };
}

export function useRequestClose(
  file: OpenFile,
  onClose: (filePath: string) => void,
  setIsDialogOpen: (open: boolean) => void,
): () => void {
  return useCallback(() => {
    if (file.isPinned) return;
    if (!file.isDirty) {
      onClose(file.path);
      return;
    }
    setIsDialogOpen(true);
  }, [file.isDirty, file.isPinned, file.path, onClose, setIsDialogOpen]);
}

interface HandleDialogActionArgs {
  file: OpenFile;
  onClose: (filePath: string) => void;
  setIsDialogOpen: (open: boolean) => void;
  saveFile: ReturnType<typeof useFileViewerManager>['saveFile'];
  discardDraft: ReturnType<typeof useFileViewerManager>['discardDraft'];
  toast: ReturnType<typeof useToastContext>['toast'];
}

export function useHandleDialogAction(args: HandleDialogActionArgs) {
  const { file, onClose, setIsDialogOpen, saveFile, discardDraft, toast } = args;
  return useCallback(
    async (choice: DirtyCloseChoice) => {
      setIsDialogOpen(false);
      const resolution = await finalizeDirtyCloseChoice({
        choice,
        discardDraft,
        filePath: file.path,
        saveFile,
      });
      if (resolution.outcome !== 'close') {
        toast(
          resolution.choice === 'save' ? resolution.error : `Kept ${file.name} open`,
          resolution.choice === 'save' ? 'error' : 'info',
        );
        return;
      }
      toast(`Closed ${file.name}`, 'info');
      onClose(file.path);
    },
    [discardDraft, file.name, file.path, onClose, saveFile, setIsDialogOpen, toast],
  );
}

export function useTabItemState(
  file: OpenFile,
  onActivate: (p: string) => void,
  onClose: (p: string) => void,
  onPin?: (p: string) => void,
) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTabHovered, setIsTabHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const { saveFile, discardDraft } = useFileViewerManager();
  const { toast } = useToastContext();
  const requestClose = useRequestClose(file, onClose, setIsDialogOpen);
  const handleDialogAction = useHandleDialogAction({
    file,
    onClose,
    setIsDialogOpen,
    saveFile,
    discardDraft,
    toast,
  });
  const tabActions = useTabActions({ file, onActivate, onRequestClose: requestClose, onPin });
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);
  const dismissContextMenu = useCallback(() => setContextMenu({ visible: false, x: 0, y: 0 }), []);
  return {
    isDialogOpen,
    isTabHovered,
    setIsTabHovered,
    contextMenu,
    dismissContextMenu,
    handleContextMenu,
    requestClose,
    handleDialogAction,
    tabActions,
  };
}
