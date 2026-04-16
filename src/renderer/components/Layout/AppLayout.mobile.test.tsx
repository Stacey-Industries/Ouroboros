/**
 * @vitest-environment jsdom
 *
 * AppLayout.mobile — smoke tests for the MobileNavBar and related primitives
 * extracted from AppLayout.tsx in Wave 28 Phase A.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_INDICATOR_STYLE,
  MOBILE_NAV_ITEMS,
  MOBILE_NAV_STYLE,
  MobileNavBar,
  MobileNavButton,
  mobileNavButtonStyle,
  MobileNavIcon,
  type MobilePanel,
} from './AppLayout.mobile';

afterEach(() => cleanup());

describe('MOBILE_NAV_ITEMS', () => {
  it('contains exactly four panel entries in order', () => {
    expect(MOBILE_NAV_ITEMS.map((i) => i.id)).toEqual(['files', 'editor', 'terminal', 'chat']);
  });
});

describe('mobileNavButtonStyle', () => {
  it('returns distinct background for active state', () => {
    const active = mobileNavButtonStyle(true);
    const inactive = mobileNavButtonStyle(false);
    expect(active.background).not.toEqual(inactive.background);
  });

  it('uses design token for active color (no hardcoded hex)', () => {
    const active = mobileNavButtonStyle(true);
    expect(active.color).toBe('var(--interactive-accent)');
  });
});

describe('ACTIVE_INDICATOR_STYLE', () => {
  it('uses design token for backgroundColor (no hardcoded hex)', () => {
    expect(ACTIVE_INDICATOR_STYLE.backgroundColor).toBe('var(--interactive-accent)');
  });
});

describe('MOBILE_NAV_STYLE', () => {
  it('sets display none (hidden by default — shown by CSS media query)', () => {
    expect(MOBILE_NAV_STYLE.display).toBe('none');
  });
});

describe('MobileNavIcon', () => {
  it('renders an svg for each panel id', () => {
    const panels: MobilePanel[] = ['files', 'editor', 'terminal', 'chat'];
    for (const id of panels) {
      const { container } = render(<MobileNavIcon id={id} />);
      expect(container.querySelector('svg')).not.toBeNull();
      cleanup();
    }
  });
});

describe('MobileNavButton', () => {
  it('calls onSwitch with the correct panel id when clicked', () => {
    const onSwitch = vi.fn();
    render(
      <MobileNavButton
        item={{ id: 'terminal', label: 'Terminal' }}
        isActive={false}
        onSwitch={onSwitch}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSwitch).toHaveBeenCalledWith('terminal');
  });

  it('renders the active indicator when isActive is true', () => {
    const { container } = render(
      <MobileNavButton item={{ id: 'chat', label: 'Chat' }} isActive={true} onSwitch={vi.fn()} />,
    );
    // Active indicator is a <span> with the ACTIVE_INDICATOR_STYLE position:absolute
    const spans = container.querySelectorAll('span');
    const indicator = Array.from(spans).find(
      (s) => (s as HTMLElement).style.position === 'absolute',
    );
    expect(indicator).toBeDefined();
  });

  it('does not render the active indicator when isActive is false', () => {
    const { container } = render(
      <MobileNavButton item={{ id: 'chat', label: 'Chat' }} isActive={false} onSwitch={vi.fn()} />,
    );
    const spans = container.querySelectorAll('span');
    const indicator = Array.from(spans).find(
      (s) => (s as HTMLElement).style.position === 'absolute',
    );
    expect(indicator).toBeUndefined();
  });
});

describe('MobileNavBar', () => {
  it('renders a nav element with all four panel buttons', () => {
    const { container } = render(<MobileNavBar active="chat" onSwitch={vi.fn()} />);
    expect(container.querySelector('nav')).not.toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('calls onSwitch when a panel button is clicked', () => {
    const onSwitch = vi.fn();
    const { container } = render(<MobileNavBar active="editor" onSwitch={onSwitch} />);
    // Buttons contain SVG + text span; find by text content via the span
    const buttons = container.querySelectorAll('button');
    const filesBtn = Array.from(buttons).find((b) => b.textContent?.includes('Files'));
    expect(filesBtn).toBeDefined();
    fireEvent.click(filesBtn!);
    expect(onSwitch).toHaveBeenCalledWith('files');
  });
});
