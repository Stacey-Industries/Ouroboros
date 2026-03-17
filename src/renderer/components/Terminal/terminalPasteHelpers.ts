/**
 * terminalPasteHelpers — chunked paste support for large text.
 *
 * When pasting text that exceeds CHUNK_THRESHOLD characters, the data is
 * split into chunks and sent with small delays between them. This prevents
 * PTY/shell buffer overflow that causes large pastes to be "compacted" or
 * silently dropped.
 *
 * The text is wrapped in bracketed paste escape sequences (\x1b[200~ ... \x1b[201~)
 * so the shell can distinguish pasted text from typed input. The opening marker
 * is sent with the first chunk and the closing marker with the last chunk, ensuring
 * the brackets are never split from the data they wrap.
 */

const CHUNK_SIZE = 4096
const CHUNK_DELAY_MS = 10
const CHUNK_THRESHOLD = 4096

const BRACKET_OPEN = '\x1b[200~'
const BRACKET_CLOSE = '\x1b[201~'

/**
 * Write paste data to the PTY using chunked delivery with bracketed paste markers.
 * For small pastes (<= CHUNK_THRESHOLD), the data is sent in a single write.
 * For large pastes, it is split into chunks with small delays between them.
 */
export async function writeChunkedPaste(
  sessionId: string,
  data: string,
): Promise<void> {
  const wrapped = `${BRACKET_OPEN}${data}${BRACKET_CLOSE}`

  if (wrapped.length <= CHUNK_THRESHOLD) {
    await window.electronAPI.pty.write(sessionId, wrapped)
    return
  }

  for (let i = 0; i < wrapped.length; i += CHUNK_SIZE) {
    const chunk = wrapped.slice(i, i + CHUNK_SIZE)
    await window.electronAPI.pty.write(sessionId, chunk)
    // Small delay between chunks to let PTY drain its buffer
    if (i + CHUNK_SIZE < wrapped.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, CHUNK_DELAY_MS))
    }
  }
}

/**
 * Returns true when a single `onData` payload looks like a paste rather than
 * a single keystroke. xterm delivers the entire clipboard content as one
 * string via the `onData` callback, so any payload above a modest length
 * threshold is almost certainly a paste.
 */
export function isPasteLikeInput(data: string): boolean {
  return data.length > 100
}

export { CHUNK_THRESHOLD }
