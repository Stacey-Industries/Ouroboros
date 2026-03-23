/**
 * gitDiffParser.ts — Unified diff parser for git output.
 */

import path from 'path';

export interface ParsedHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  rawPatch: string;
}

export interface ParsedFileDiff {
  filePath: string;
  relativePath: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  hunks: ParsedHunk[];
  oldPath?: string;
}

function detectFileStatus(
  lines: string[],
  aPath: string,
  bPath: string,
): { status: ParsedFileDiff['status']; oldPath?: string } {
  let status: ParsedFileDiff['status'] = 'modified';
  let oldPath: string | undefined;

  for (const line of lines.slice(1, 6)) {
    if (line.startsWith('new file mode')) status = 'added';
    else if (line.startsWith('deleted file mode')) status = 'deleted';
    else if (line.startsWith('rename from')) {
      status = 'renamed';
      oldPath = line.replace('rename from ', '');
    }
  }
  if (aPath !== bPath && !oldPath) {
    status = 'renamed';
    oldPath = aPath;
  }
  return { status, oldPath };
}

// eslint-disable-next-line security/detect-unsafe-regex -- only runs on git diff output, not user input
const HUNK_RE = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function collectHunkLines(
  lines: string[],
  startIdx: number,
): { hunkLines: string[]; nextIdx: number } {
  const hunkLines: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const nextLine = lines.at(i);
    if (!nextLine || nextLine.startsWith('@@') || nextLine.startsWith('diff --git')) break;
    hunkLines.push(nextLine);
    i++;
  }
  return { hunkLines, nextIdx: i };
}

function buildHunk(
  header: string,
  m: RegExpMatchArray,
  hunkLines: string[],
  diffHeader: string,
): ParsedHunk {
  return {
    header,
    oldStart: parseInt(m[1], 10),
    oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
    newStart: parseInt(m[3], 10),
    newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
    lines: hunkLines,
    rawPatch: diffHeader + header + '\n' + hunkLines.join('\n') + '\n',
  };
}

function parseHunks(lines: string[], startIdx: number, diffHeader: string): ParsedHunk[] {
  const hunks: ParsedHunk[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const currentLine = lines.at(i);
    if (!currentLine?.startsWith('@@')) {
      i++;
      continue;
    }
    const m = currentLine.match(HUNK_RE);
    if (!m) {
      i++;
      continue;
    }
    const { hunkLines, nextIdx } = collectHunkLines(lines, i + 1);
    hunks.push(buildHunk(currentLine, m, hunkLines, diffHeader));
    i = nextIdx;
  }
  return hunks;
}

export function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return [];

  const files: ParsedFileDiff[] = [];
  const fileDiffs = diffText.split(/^(?=diff --git )/m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n');
    if (lines.length === 0) continue;

    const headerMatch = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!headerMatch) continue;

    const { status, oldPath } = detectFileStatus(lines, headerMatch[1], headerMatch[2]);
    const relativePath = headerMatch[2];

    let diffHeaderEnd = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines.at(i)?.startsWith('@@')) {
        diffHeaderEnd = i;
        break;
      }
    }
    const diffHeader = lines.slice(0, diffHeaderEnd).join('\n') + '\n';
    const hunks = parseHunks(lines, diffHeaderEnd, diffHeader);

    files.push({
      filePath: path.resolve(root, relativePath),
      relativePath,
      status,
      hunks,
      oldPath,
    });
  }
  return files;
}
