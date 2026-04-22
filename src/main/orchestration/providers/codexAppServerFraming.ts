import log from '../../logger';

const MAX_BUFFER_BYTES = 100 * 1024 * 1024;

export interface CodexAppServerFramingOptions {
  onInvalidMessage?: (line: string, error: Error) => void;
}

export function encodeCodexAppServerMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

export class CodexAppServerFramingParser<TMessage = unknown> {
  private buffer = '';
  private readonly onInvalidMessage?: CodexAppServerFramingOptions['onInvalidMessage'];

  public constructor(options: CodexAppServerFramingOptions = {}) {
    this.onInvalidMessage = options.onInvalidMessage;
  }

  public push(chunk: Buffer | string): TMessage[] {
    this.buffer += chunk.toString();
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      throw new Error('Codex app-server stdout buffer exceeded maximum allowed size (100 MB).');
    }
    return this.drainLines(false);
  }

  public flush(): TMessage[] {
    return this.drainLines(true);
  }

  public get bufferedLength(): number {
    return this.buffer.length;
  }

  private drainLines(flushTrailingLine: boolean): TMessage[] {
    const messages: TMessage[] = [];
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      this.parseLine(this.buffer.slice(0, newlineIndex), messages);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf('\n');
    }
    if (flushTrailingLine && this.buffer.trim()) {
      this.parseLine(this.buffer, messages);
      this.buffer = '';
    }
    return messages;
  }

  private parseLine(line: string, messages: TMessage[]): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      messages.push(JSON.parse(trimmed) as TMessage);
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error(String(error));
      this.onInvalidMessage?.(trimmed, parseError);
      log.warn('[codexAppServerFraming] malformed line:', trimmed.slice(0, 120));
    }
  }
}
