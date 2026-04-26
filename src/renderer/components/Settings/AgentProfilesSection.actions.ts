import { useState } from 'react';

import type { Profile } from '../../types/electron';

export function useProfileActions() {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string): void {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDelete(profile: Profile): Promise<void> {
    const res = await window.electronAPI.profileCrud.delete(profile.id);
    if (!res.success) showToast(res.error ?? 'Delete failed');
  }

  async function handleExport(profile: Profile): Promise<void> {
    const res = await window.electronAPI.profileCrud.export(profile.id);
    if (!res.success || !res.json) {
      showToast('Export failed');
      return;
    }
    await navigator.clipboard.writeText(res.json);
    showToast(`"${profile.name}" copied to clipboard.`);
  }

  async function handleImport(json: string): Promise<void> {
    const res = await window.electronAPI.profileCrud.import(json);
    if (!res.success) throw new Error(res.error ?? 'Import failed');
    showToast('Profile imported.');
  }

  function makeDuplicate(profile: Profile): Profile {
    return {
      ...profile,
      id: `profile-${Date.now()}`,
      name: `${profile.name} (copy)`,
      builtIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return { toast, handleDelete, handleExport, handleImport, makeDuplicate };
}
