function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(text: string): string {
  let nextText = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width:100%;" />`,
  );

  nextText = nextText.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, url) => {
      const safeUrl = /^(https?:|mailto:|#)/.test(url) ? escapeHtml(url) : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    },
  );

  nextText = nextText.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  nextText = nextText.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  nextText = nextText.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  nextText = nextText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  nextText = nextText.replace(/__(.+?)__/g, '<strong>$1</strong>');
  nextText = nextText.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  nextText = nextText.replace(/_([^_]+)_/g, '<em>$1</em>');
  return nextText.replace(/~~(.+?)~~/g, '<del>$1</del>');
}

function renderList(lines: string[], ordered: boolean): string {
  const openTag = ordered ? '<ol>\n' : '<ul>\n';
  const closeTag = ordered ? '</ol>\n' : '</ul>\n';
  const items = lines.map((line) => {
    const content = line.replace(/^(\s*(?:\d+\.|-|\*|\+)\s+)/, '');
    return `<li>${renderInline(content)}</li>\n`;
  });
  return `${openTag}${items.join('')}${closeTag}`;
}

function renderCodeBlock(lines: string[], startIndex: number): [string, number] {
  const lang = lines[startIndex].slice(3).trim();
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^```/.test(lines[index])) {
    codeLines.push(lines[index]);
    index++;
  }

  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
  const html = `<pre${langAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>\n`;
  return [html, index + 1];
}

function renderBlockquote(lines: string[], startIndex: number): [string, number] {
  const quoteLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && /^>\s?/.test(lines[index])) {
    quoteLines.push(lines[index].replace(/^>\s?/, ''));
    index++;
  }

  return [`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>\n`, index];
}

function renderMatchingList(
  lines: string[],
  startIndex: number,
  matcher: RegExp,
  ordered: boolean,
): [string, number] {
  const listLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && matcher.test(lines[index])) {
    listLines.push(lines[index]);
    index++;
  }

  return [renderList(listLines, ordered), index];
}

function renderParagraph(lines: string[], startIndex: number): [string, number] {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (
    index < lines.length &&
    lines[index].trim() !== '' &&
    !/^(#{1,6}\s|>|```|(\s*[-*+]\s+)|\s*\d+\.\s+|---+|===+|\*\*\*+)/.test(lines[index])
  ) {
    paragraphLines.push(lines[index]);
    index++;
  }

  if (paragraphLines.length === 0) {
    return ['', index + 1];
  }

  return [`<p>${renderInline(paragraphLines.join(' '))}</p>\n`, index];
}

type BlockRenderer = (lines: string[], startIndex: number) => [string, number] | null;

const BLOCK_RENDERERS: BlockRenderer[] = [
  (lines, startIndex) => (/^```/.test(lines[startIndex]) ? renderCodeBlock(lines, startIndex) : null),
  (lines, startIndex) => (
    /^(?:---+|===+|\*\*\*+)\s*$/.test(lines[startIndex])
      ? ['<hr />\n', startIndex + 1]
      : null
  ),
  (lines, startIndex) => {
    const headingMatch = lines[startIndex].match(/^(#{1,6})\s+(.+)/);
    if (!headingMatch) return null;
    const level = headingMatch[1].length;
    return [`<h${level}>${renderInline(headingMatch[2])}</h${level}>\n`, startIndex + 1];
  },
  (lines, startIndex) => (/^>\s?/.test(lines[startIndex]) ? renderBlockquote(lines, startIndex) : null),
  (lines, startIndex) => (
    /^(\s*[-*+]\s+)/.test(lines[startIndex])
      ? renderMatchingList(lines, startIndex, /^(\s*[-*+]\s+)/, false)
      : null
  ),
  (lines, startIndex) => (
    /^\s*\d+\.\s+/.test(lines[startIndex])
      ? renderMatchingList(lines, startIndex, /^\s*\d+\.\s+/, true)
      : null
  ),
  (lines, startIndex) => (lines[startIndex].trim() === '' ? ['', startIndex + 1] : null),
];

function renderBlock(lines: string[], startIndex: number): [string, number] {
  for (const render of BLOCK_RENDERERS) {
    const result = render(lines, startIndex);
    if (result) return result;
  }

  return renderParagraph(lines, startIndex);
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let index = 0;

  while (index < lines.length) {
    const [blockHtml, nextIndex] = renderBlock(lines, index);
    html += blockHtml;
    index = nextIndex;
  }

  return html;
}
