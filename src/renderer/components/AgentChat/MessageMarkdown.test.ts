import { describe, expect, it } from 'vitest';

describe('MessageMarkdown', () => {
  it('exports MessageMarkdown component', async () => {
    const mod = await import('./MessageMarkdown');
    expect(typeof mod.MessageMarkdown).toBe('object'); // React.memo wraps it
  });

  it('MessageMarkdownProps accepts streaming prop', () => {
    // Type-level check — if this compiles, the streaming prop exists
    const props: import('./MessageMarkdown').MessageMarkdownProps = {
      content: 'hello',
      streaming: true,
    };
    expect(props.streaming).toBe(true);
  });
});
