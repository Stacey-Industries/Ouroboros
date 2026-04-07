/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextUsageBar } from './ContextUsageBar';

describe('ContextUsageBar', () => {
  it('renders nothing when inputTokens is 0', () => {
    const { container } = render(<ContextUsageBar inputTokens={0} model="claude-sonnet-4-6" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when inputTokens is negative', () => {
    const { container } = render(<ContextUsageBar inputTokens={-1} model="claude-sonnet-4-6" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows percentage label when tokens are present', () => {
    // 40,000 / 200,000 = 20%
    render(<ContextUsageBar inputTokens={40_000} model="claude-sonnet-4-6" />);
    expect(screen.getByText('20% ctx')).toBeDefined();
  });

  it('caps at 100% when tokens exceed context limit', () => {
    render(<ContextUsageBar inputTokens={9_999_999} model="claude-sonnet-4-6" />);
    expect(screen.getByText('100% ctx')).toBeDefined();
  });

  it('includes token counts in the title attribute', () => {
    const { container } = render(
      <ContextUsageBar inputTokens={50_000} model="claude-sonnet-4-6" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el?.title).toContain('50,000');
    expect(el?.title).toContain('200,000');
  });

  it('applies warning class at 70%+ usage', () => {
    // 140,000 / 200,000 = 70%
    const { container } = render(
      <ContextUsageBar inputTokens={140_000} model="claude-sonnet-4-6" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el?.className).toContain('text-status-warning');
  });

  it('applies error class at 90%+ usage', () => {
    // 180,000 / 200,000 = 90%
    const { container } = render(
      <ContextUsageBar inputTokens={180_000} model="claude-sonnet-4-6" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el?.className).toContain('text-status-error');
  });

  it('applies muted class for low usage', () => {
    // 10,000 / 200,000 = 5%
    const { container } = render(
      <ContextUsageBar inputTokens={10_000} model="claude-sonnet-4-6" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el?.className).toContain('text-text-semantic-muted');
  });

  it('uses 1M context limit for [1m] model variant', () => {
    // 500,000 / 1,000,000 = 50%
    render(<ContextUsageBar inputTokens={500_000} model="claude-opus-4-6[1m]" />);
    expect(screen.getByText('50% ctx')).toBeDefined();
  });
});
