/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelContextUsageIndicator } from './ChatControlsBar.rings';

describe('ModelContextUsageIndicator', () => {
  it('renders nothing when usage array is empty', () => {
    const { container } = render(<ModelContextUsageIndicator usage={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a ring for each usage entry', () => {
    const usage = [
      { model: 'claude-3-5-sonnet-20241022', inputTokens: 50000, outputTokens: 0 },
      { model: 'claude-3-haiku-20240307', inputTokens: 10000, outputTokens: 0 },
    ];
    const { container } = render(<ModelContextUsageIndicator usage={usage} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
  });

  it('caps percentage at 100 when tokens exceed context limit', () => {
    const usage = [{ model: 'claude-3-5-sonnet-20241022', inputTokens: 9_999_999, outputTokens: 0 }];
    render(<ModelContextUsageIndicator usage={usage} />);
    const text = screen.getByText('100');
    expect(text).toBeDefined();
  });

  it('shows 0% when inputTokens is 0', () => {
    const usage = [{ model: 'claude-3-5-sonnet-20241022', inputTokens: 0, outputTokens: 0 }];
    render(<ModelContextUsageIndicator usage={usage} />);
    const text = screen.getByText('0');
    expect(text).toBeDefined();
  });
});
