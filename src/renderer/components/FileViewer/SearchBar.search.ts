import type { SearchMatch } from './SearchBar';

interface SearchResult {
  matches: SearchMatch[];
  lineNumbers: number[];
}

interface TextSegment {
  node: Text;
  start: number;
}

const MATCH_CLASS = 'fv-search-match';
const ACTIVE_MATCH_CLASS = 'fv-search-match-active';

function getTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    nodes.push(node);
  }
  return nodes;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchRegex(query: string, caseSensitive: boolean, useRegex: boolean): RegExp | null {
  try {
    const pattern = useRegex ? query : escapeRegex(query);
    return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function collectSegments(codeContainer: HTMLElement): { fullText: string; segments: TextSegment[] } {
  let fullText = '';
  const segments = getTextNodes(codeContainer).map((node) => {
    const segment = { node, start: fullText.length };
    fullText += node.textContent ?? '';
    return segment;
  });
  return { fullText, segments };
}

function findSegmentIndex(segments: TextSegment[], absoluteOffset: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].start <= absoluteOffset) {
      return index;
    }
  }
  return 0;
}

function findMatches(fullText: string, segments: TextSegment[], regex: RegExp): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    const nodeIndex = findSegmentIndex(segments, match.index);
    matches.push({
      nodeIndex,
      offsetInNode: match.index - segments[nodeIndex].start,
      length: match[0].length,
      absoluteOffset: match.index,
    });
  }
  return matches;
}

function getLineStartOffsets(fullText: string): number[] {
  const offsets = [0];
  for (let index = 0; index < fullText.length; index += 1) {
    if (fullText[index] === '\n') {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function getLineNumber(lineStartOffsets: number[], absoluteOffset: number): number {
  let low = 0;
  let high = lineStartOffsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStartOffsets[mid] <= absoluteOffset) {
      low = mid;
      continue;
    }
    high = mid - 1;
  }
  return low + 1;
}

function getMatchLines(fullText: string, matches: SearchMatch[]): number[] {
  const lineStartOffsets = getLineStartOffsets(fullText);
  const lineNumbers = matches.map((match) => getLineNumber(lineStartOffsets, match.absoluteOffset));
  return [...new Set(lineNumbers)];
}

function createHighlightFragment(nodeText: string, start: number, end: number, isActive: boolean): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const before = nodeText.slice(0, start);
  const after = nodeText.slice(end);
  if (before) {
    fragment.appendChild(document.createTextNode(before));
  }
  const mark = document.createElement('mark');
  mark.className = isActive ? `${MATCH_CLASS} ${ACTIVE_MATCH_CLASS}` : MATCH_CLASS;
  mark.textContent = nodeText.slice(start, end);
  fragment.appendChild(mark);
  if (after) {
    fragment.appendChild(document.createTextNode(after));
  }
  return fragment;
}

function highlightMatches(matches: SearchMatch[], segments: TextSegment[]): void {
  for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
    const match = matches[matchIndex];
    const matchStart = match.absoluteOffset;
    const matchEnd = matchStart + match.length;
    for (const segment of segments) {
      const nodeText = segment.node.textContent ?? '';
      const nodeStart = segment.start;
      const nodeEnd = nodeStart + nodeText.length;
      if (nodeEnd <= matchStart || nodeStart >= matchEnd) {
        continue;
      }
      const parent = segment.node.parentNode;
      if (!parent) {
        break;
      }
      const overlapStart = Math.max(matchStart, nodeStart) - nodeStart;
      const overlapEnd = Math.min(matchEnd, nodeEnd) - nodeStart;
      parent.replaceChild(
        createHighlightFragment(nodeText, overlapStart, overlapEnd, matchIndex === 0),
        segment.node,
      );
      break;
    }
  }
}

export function searchInContainer(params: {
  codeContainer: HTMLElement;
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
}): SearchResult | null {
  const regex = buildSearchRegex(params.query, params.caseSensitive, params.useRegex);
  if (!regex) {
    return null;
  }
  const { fullText, segments } = collectSegments(params.codeContainer);
  const matches = findMatches(fullText, segments, regex);
  highlightMatches(matches, segments);
  return { matches, lineNumbers: getMatchLines(fullText, matches) };
}

export function clearHighlights(codeContainer: HTMLElement | null): void {
  if (!codeContainer) {
    return;
  }
  const marks = codeContainer.querySelectorAll(`mark.${MATCH_CLASS}`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  });
}

export function syncActiveMatch(codeContainer: HTMLElement | null, activeMatchIndex: number): void {
  if (!codeContainer) {
    return;
  }
  const marks = codeContainer.querySelectorAll<HTMLElement>(`mark.${MATCH_CLASS}`);
  marks.forEach((mark, index) => {
    mark.classList.toggle(ACTIVE_MATCH_CLASS, index === activeMatchIndex);
  });
  const activeMark = marks.item(activeMatchIndex);
  if (activeMark) {
    activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function getMatchLabel(query: string, matchCount: number, activeMatchIndex: number): string {
  if (!query) {
    return '';
  }
  if (matchCount === 0) {
    return 'No matches';
  }
  return `${activeMatchIndex + 1} of ${matchCount}`;
}
