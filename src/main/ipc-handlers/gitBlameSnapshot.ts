/**
 * gitBlameSnapshot.ts — Git blame parsing and snapshot management helpers.
 *
 * Split from git.ts to keep that file under the 300-line limit.
 * These functions are pure utilities — they have no IPC registrations.
 */

interface BlameInfo {
  author: string;
  date: number;
  summary: string;
}
export interface BlameLine extends BlameInfo {
  hash: string;
  line: number;
}
interface BlameMetadata extends Partial<BlameInfo> {
  nextIndex: number;
}

// ─── Blame parsing ────────────────────────────────────────────────────

function parseBlameHeader(line: string): { hash: string; line: number } | undefined {
  const match = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
  return match ? { hash: match[1], line: Number(match[2]) } : undefined;
}

function readBlameMetadata(lines: string[], startIndex: number): BlameMetadata {
  const metadata: BlameMetadata = { nextIndex: startIndex };
  while (metadata.nextIndex < lines.length && !lines[metadata.nextIndex].startsWith('\t')) {
    const line = lines[metadata.nextIndex];
    if (line.startsWith('author ')) metadata.author = line.slice(7);
    else if (line.startsWith('author-time ')) metadata.date = Number(line.slice(12));
    else if (line.startsWith('summary ')) metadata.summary = line.slice(8);
    metadata.nextIndex++;
  }
  if (lines[metadata.nextIndex]?.startsWith('\t')) metadata.nextIndex++;
  return metadata;
}

function resolveBlameInfo(
  cache: Map<string, BlameInfo>,
  hash: string,
  metadata: BlameMetadata,
): BlameInfo {
  const base = cache.get(hash) ?? { author: 'Unknown', date: 0, summary: '' };
  const info = {
    author: metadata.author ?? base.author,
    date: metadata.date ?? base.date,
    summary: metadata.summary ?? base.summary,
  };
  if (metadata.author !== undefined) cache.set(hash, info);
  return info;
}

export function parseBlameOutput(stdout: string): BlameLine[] {
  const result: BlameLine[] = [];
  const cache = new Map<string, BlameInfo>();
  const lines = stdout.split('\n');
  for (let index = 0; index < lines.length; ) {
    // eslint-disable-next-line security/detect-object-injection -- index is a numeric loop variable, not user-controlled
    const header = parseBlameHeader(lines[index]);
    if (!header) {
      index++;
      continue;
    }
    const metadata = readBlameMetadata(lines, index + 1);
    result.push({
      hash: header.hash,
      line: header.line,
      ...resolveBlameInfo(cache, header.hash, metadata),
    });
    index = metadata.nextIndex;
  }
  return result;
}

// ─── Snapshot helpers ─────────────────────────────────────────────────

export type GitExecFn = (
  args: string[],
  opts: { cwd: string; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;
export type GitStdoutFn = (root: string, args: string[], maxBuffer?: number) => Promise<string>;
export type GitTrimmedFn = (root: string, args: string[], maxBuffer?: number) => Promise<string>;

function snapshotBranchBase(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `ouroboros/snapshot-${y}${m}${d}-${h}${min}${s}`;
}

async function checkoutSnapshotBranch(
  gitExec: GitExecFn,
  root: string,
  commitHash: string,
  branchName: string,
): Promise<string> {
  try {
    await gitExec(['checkout', '-b', branchName, commitHash], { cwd: root });
    return branchName;
  } catch {
    const fallback = `${branchName}-${Math.random().toString(36).slice(2, 6)}`;
    await gitExec(['checkout', '-b', fallback, commitHash], { cwd: root });
    return fallback;
  }
}

async function getDirtyCount(gitStdout: GitStdoutFn, root: string): Promise<number> {
  return (await gitStdout(root, ['status', '--porcelain'])).split('\n').filter((l) => l.trim())
    .length;
}

async function getPreviousBranch(
  gitTrimmed: GitTrimmedFn,
  root: string,
): Promise<string | undefined> {
  try {
    const branch = await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return branch === 'HEAD' ? undefined : branch;
  } catch {
    return undefined;
  }
}

async function stashDirtyChanges(
  gitExec: GitExecFn,
  gitStdout: GitStdoutFn,
  root: string,
  dirtyCount: number,
): Promise<string | undefined> {
  if (dirtyCount === 0) return undefined;
  await gitExec(
    ['stash', 'push', '-m', `ouroboros-time-travel-${Date.now()}`, '--include-untracked'],
    { cwd: root },
  );
  try {
    return (
      (await gitStdout(root, ['stash', 'list', '--format=%gd %s', '-n', '1'])).match(
        /^(stash@\{\d+\})/,
      )?.[1] ?? 'stash@{0}'
    );
  } catch {
    return 'stash@{0}';
  }
}

export async function restoreSnapshot(args: {
  gitExec: GitExecFn;
  gitStdout: GitStdoutFn;
  gitTrimmed: GitTrimmedFn;
  root: string;
  commitHash: string;
}): Promise<{ stashRef?: string; dirtyCount: number; branch: string; previousBranch?: string }> {
  const { gitExec, gitStdout, gitTrimmed, root, commitHash } = args;
  const dirtyCount = await getDirtyCount(gitStdout, root).catch(() => 0);
  const previousBranch = await getPreviousBranch(gitTrimmed, root);
  const stashRef = await stashDirtyChanges(gitExec, gitStdout, root, dirtyCount);
  const branch = await checkoutSnapshotBranch(gitExec, root, commitHash, snapshotBranchBase());
  return { stashRef, dirtyCount, branch, previousBranch };
}
