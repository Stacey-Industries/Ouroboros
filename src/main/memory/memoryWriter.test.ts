import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { deleteMemoryEntry, writeMemoryEntry } from './memoryWriter';

// getProjectMemoryDir(cwd) resolves to path.join(os.homedir(), '.claude', 'projects', slug, 'memory')
// where slug = sanitizeCwd(cwd). For a cwd with no special chars, sanitizeCwd(slug) === slug.
// We create a uniquely-named dir under ~/.claude/projects/ and pass the slug as cwd.
async function makeRealMemDir(): Promise<{ cwd: string; memDir: string }> {
  const slug = `wave75-test-${Date.now()}`;
   
  const memDir = path.join(os.homedir(), '.claude', 'projects', slug, 'memory');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.promises.mkdir(memDir, { recursive: true });
  return { cwd: slug, memDir };
}

describe('writeMemoryEntry', () => {
  it('writes entry file atomically', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const res = await writeMemoryEntry(cwd, 'test_entry', 'Body content.', {
      description: 'A test entry',
      type: 'user',
    });
    expect(res.success).toBe(true);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const written = await fs.promises.readFile(path.join(memDir, 'test_entry.md'), 'utf8');
    expect(written).toContain('Body content.');
    expect(written).toContain('type: user');
    await expect(
       
      fs.promises.access(`${path.join(memDir, 'test_entry.md')}.tmp`),
    ).rejects.toThrow();
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  it('returns failure for invalid type', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const res = await writeMemoryEntry(cwd, 'bad_entry', 'content', {
      description: 'desc',
      type: 'invalid' as never,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/invalid type/);
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  it('rejects path-traversal ids', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const res = await writeMemoryEntry(cwd, '../../../evil', 'x', { description: '', type: 'user' });
    expect(res.success).toBe(false);
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  it('updates MEMORY.md index description if present', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const indexPath = path.join(memDir, 'MEMORY.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.promises.writeFile(
      indexPath,
      '# Memory\n\n## User\n- [My Entry](my_entry.md) — old description\n',
      'utf8',
    );
    await writeMemoryEntry(cwd, 'my_entry', 'content', { description: 'new desc', type: 'user' });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const updated = await fs.promises.readFile(indexPath, 'utf8');
    expect(updated).toContain('new desc');
    expect(updated).not.toContain('old description');
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });
});

describe('deleteMemoryEntry', () => {
  it('deletes the entry file and index line', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const entryPath = path.join(memDir, 'to_delete.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.promises.writeFile(entryPath, '# content', 'utf8');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.promises.writeFile(
      path.join(memDir, 'MEMORY.md'),
      '## Section\n- [To Delete](to_delete.md) — hook\n',
      'utf8',
    );
    const res = await deleteMemoryEntry(cwd, 'to_delete');
    expect(res.success).toBe(true);
     
    await expect(fs.promises.access(entryPath)).rejects.toThrow();
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const index = await fs.promises.readFile(path.join(memDir, 'MEMORY.md'), 'utf8');
    expect(index).not.toContain('to_delete.md');
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  it('is idempotent on missing entry file', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const res = await deleteMemoryEntry(cwd, 'nonexistent');
    expect(res.success).toBe(true);
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  it('rejects path-traversal ids', async () => {
    const { cwd, memDir } = await makeRealMemDir();
    const res = await deleteMemoryEntry(cwd, '../../../evil');
    expect(res.success).toBe(false);
     
    await fs.promises.rm(path.dirname(memDir), { recursive: true, force: true });
  });
});
