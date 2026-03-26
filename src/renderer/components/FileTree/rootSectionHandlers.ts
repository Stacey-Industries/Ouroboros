/**
 * rootSectionHandlers.ts — extracted handler logic for RootSection.
 *
 * Reduces complexity of the main component by isolating async operations.
 */

import type { useToastContext } from '../../contexts/ToastContext';
import type { TreeNode } from './FileTreeItem';
import type { EditState } from './fileTreeUtils';
import { normPath,parentDir, pathJoin } from './fileTreeUtils';

type ToastFn = ReturnType<typeof useToastContext>['toast'];

interface EditConfirmDeps {
  editState: EditState | null;
  toast: ToastFn;
  refreshDir: (dir: string) => Promise<void>;
  onFileSelect: (path: string) => void;
  clearEdit: () => void;
}

export async function handleRenameOp(deps: EditConfirmDeps, newName: string): Promise<void> {
  if (!deps.editState) return;
  const dir = parentDir(deps.editState.targetPath);
  const newPath = pathJoin(dir, newName);
  const result = await window.electronAPI.files.rename(deps.editState.targetPath, newPath);
  if (result.success) {
    deps.toast(`Renamed to "${newName}"`, 'success');
    await deps.refreshDir(dir);
  } else {
    deps.toast(`Rename failed: ${result.error}`, 'error');
  }
  deps.clearEdit();
}

export async function handleNewFileOp(deps: EditConfirmDeps, newName: string): Promise<void> {
  if (!deps.editState) return;
  const newPath = pathJoin(deps.editState.targetPath, newName);
  const result = await window.electronAPI.files.createFile(newPath);
  if (result.success) {
    deps.toast(`Created "${newName}"`, 'success');
    await deps.refreshDir(deps.editState.targetPath);
    deps.onFileSelect(newPath);
  } else {
    deps.toast(`Create failed: ${result.error}`, 'error');
  }
  deps.clearEdit();
}

export async function handleNewFolderOp(deps: EditConfirmDeps, newName: string): Promise<void> {
  if (!deps.editState) return;
  const newPath = pathJoin(deps.editState.targetPath, newName);
  const result = await window.electronAPI.files.mkdir(newPath);
  if (result.success) {
    deps.toast(`Created folder "${newName}"`, 'success');
    await deps.refreshDir(deps.editState.targetPath);
  } else {
    deps.toast(`Create failed: ${result.error}`, 'error');
  }
  deps.clearEdit();
}

export async function handleExternalDrop(
  files: File[],
  destDir: string,
  toast: ToastFn,
  refreshDir: (dir: string) => Promise<void>,
): Promise<void> {
  for (const file of files) {
    const destPath = pathJoin(destDir, file.name);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const result = await window.electronAPI.files.writeFile(destPath, buf);
      if (result.success) toast(`Copied "${file.name}"`, 'success');
      else toast(`Copy failed: ${result.error}`, 'error');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Copy failed: ${msg}`, 'error');
    }
  }
  await refreshDir(destDir);
}

export async function handleInternalDrop(
  sourcePath: string,
  targetNode: TreeNode,
  toast: ToastFn,
  refreshDir: (dir: string) => Promise<void>,
): Promise<void> {
  const destDir = targetNode.isDirectory ? targetNode.path : parentDir(targetNode.path);
  if (sourcePath === targetNode.path) return;

  const sep = sourcePath.includes('\\') ? '\\' : '/';
  const sourceName = sourcePath.split(sep).pop()!;
  const destPath = pathJoin(destDir, sourceName);

  if (destPath === sourcePath) return;
  if (normPath(destPath).startsWith(normPath(sourcePath) + '/')) {
    toast('Cannot move a folder into itself', 'error');
    return;
  }

  const result = await window.electronAPI.files.rename(sourcePath, destPath);
  if (result.success) {
    toast(`Moved "${sourceName}"`, 'success');
    await refreshDir(parentDir(sourcePath));
    if (targetNode.isDirectory) await refreshDir(targetNode.path);
  } else {
    toast(`Move failed: ${result.error}`, 'error');
  }
}
