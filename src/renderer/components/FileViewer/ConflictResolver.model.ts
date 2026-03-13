export type ConflictChoice = 'ours' | 'theirs' | 'both';

export interface ConflictBlock {
  startLine: number;
  dividerLine: number;
  endLine: number;
  oursLabel: string;
  theirsLabel: string;
  oursLines: string[];
  theirsLines: string[];
}

export interface ConflictResolverProps {
  content: string;
  filePath: string;
  onResolved: (newContent: string) => void;
}

export function hasConflictMarkers(content: string): boolean {
  return content.includes('<<<<<<<') && content.includes('=======') && content.includes('>>>>>>>');
}

export function parseConflictBlocks(lines: string[]): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].startsWith('<<<<<<<')) {
      index += 1;
      continue;
    }
    const startLine = index;
    const oursLabel = lines[index].replace('<<<<<<<', '').trim();
    const oursLines: string[] = [];
    index += 1;
    while (index < lines.length && !lines[index].startsWith('=======')) {
      oursLines.push(lines[index]);
      index += 1;
    }
    const dividerLine = index;
    const theirsLines: string[] = [];
    index += 1;
    while (index < lines.length && !lines[index].startsWith('>>>>>>>')) {
      theirsLines.push(lines[index]);
      index += 1;
    }
    const theirsLabel = lines[index]?.replace('>>>>>>>', '').trim() ?? '';
    blocks.push({
      startLine,
      dividerLine,
      endLine: index,
      oursLabel,
      theirsLabel,
      oursLines,
      theirsLines,
    });
    index += 1;
  }
  return blocks;
}

export function resolveConflictBlock(lines: string[], block: ConflictBlock, choice: ConflictChoice): string[] {
  const replacement = choice === 'ours'
    ? block.oursLines
    : choice === 'theirs'
      ? block.theirsLines
      : [...block.oursLines, ...block.theirsLines];
  return [...lines.slice(0, block.startLine), ...replacement, ...lines.slice(block.endLine + 1)];
}
