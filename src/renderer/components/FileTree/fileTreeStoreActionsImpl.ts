/**
 * fileTreeStoreActionsImpl.ts — action creators for fileTreeStore.
 *
 * Extracted to keep the immer callback under the 40-line function limit.
 * Each action calls `set()` with an immer-managed state draft.
 */

import type { WritableDraft } from 'immer';

import type { FileTreeState } from './fileTreeStore';
import { buildFileTreeActions } from './fileTreeStoreActionsImpl.helpers';

type SetFn = (updater: (state: WritableDraft<FileTreeState>) => void) => void;

export function createFileTreeActions(set: SetFn) {
  return buildFileTreeActions(set);
}
