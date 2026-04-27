/**
 * @vitest-environment jsdom
 *
 * OuterProjectRail — unit tests (Wave 59 Phase B).
 *
 * Verifies:
 *  - Renders without throwing.
 *  - Project icons render for each project in the list.
 *  - Clicking a project icon calls onSelectProject with the correct path.
 *  - The active project icon has aria-pressed="true".
 *  - The "+" add-project button is present.
 *  - Search and Settings footer buttons are present.
 *  - Clicking Settings calls onOpenSettings.
 *  - projectInitials helper trims to 2 uppercase chars.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OuterProjectRail, projectInitials } from './OuterProjectRail';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    addProjectRoot: vi.fn(),
    projectRoot: '/proj/a',
    projectRoots: ['/proj/a'],
  }),
}));

vi.mock('../../../hooks/appEventNames', () => ({
  WORKBENCH_OPEN_CHAT_SEARCH_EVENT: 'agent-ide:workbench-open-chat-search',
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECTS = ['/home/user/alpha-app', '/home/user/beta-app'];

function makeProps(overrides: Partial<React.ComponentProps<typeof OuterProjectRail>> = {}) {
  return {
    activeProject: PROJECTS[0],
    onAddProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectProject: vi.fn(),
    projects: PROJECTS,
    ...overrides,
  };
}

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OuterProjectRail', () => {
  it('renders without throwing', () => {
    const { container } = render(<OuterProjectRail {...makeProps()} />);
    expect(container).toBeDefined();
  });

  it('renders a project icon for each project', () => {
    render(<OuterProjectRail {...makeProps()} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
    // Two project icons (initials buttons)
    const alphaLabel = projectInitials(PROJECTS[0]);
    const betaLabel = projectInitials(PROJECTS[1]);
    expect(screen.getByTestId(`project-icon-${alphaLabel}`)).toBeDefined();
    expect(screen.getByTestId(`project-icon-${betaLabel}`)).toBeDefined();
  });

  it('marks the active project icon with aria-pressed=true', () => {
    render(<OuterProjectRail {...makeProps({ activeProject: PROJECTS[1] })} />);
    const betaLabel = projectInitials(PROJECTS[1]);
    const betaBtn = screen.getByTestId(`project-icon-${betaLabel}`);
    expect(betaBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks inactive project icon with aria-pressed=false', () => {
    render(<OuterProjectRail {...makeProps({ activeProject: PROJECTS[0] })} />);
    const betaLabel = projectInitials(PROJECTS[1]);
    const betaBtn = screen.getByTestId(`project-icon-${betaLabel}`);
    expect(betaBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelectProject with the correct path when clicked', () => {
    const onSelectProject = vi.fn();
    render(<OuterProjectRail {...makeProps({ onSelectProject })} />);
    const betaLabel = projectInitials(PROJECTS[1]);
    fireEvent.click(screen.getByTestId(`project-icon-${betaLabel}`));
    expect(onSelectProject).toHaveBeenCalledWith(PROJECTS[1]);
  });

  it('renders the add-project button', () => {
    render(<OuterProjectRail {...makeProps()} />);
    expect(screen.getByTestId('outer-rail-add-project')).toBeDefined();
  });

  it('renders the search footer button', () => {
    render(<OuterProjectRail {...makeProps()} />);
    expect(screen.getByTestId('outer-rail-search')).toBeDefined();
  });

  it('renders the settings footer button', () => {
    render(<OuterProjectRail {...makeProps()} />);
    expect(screen.getByTestId('outer-rail-settings')).toBeDefined();
  });

  it('calls onOpenSettings when settings button is clicked', () => {
    const onOpenSettings = vi.fn();
    render(<OuterProjectRail {...makeProps({ onOpenSettings })} />);
    fireEvent.click(screen.getByTestId('outer-rail-settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('dispatches search event when search button is clicked', () => {
    const dispatched: Event[] = [];
    const orig = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push(e);
      return orig(e);
    });
    render(<OuterProjectRail {...makeProps()} />);
    fireEvent.click(screen.getByTestId('outer-rail-search'));
    expect(dispatched.some((e) => e.type === 'agent-ide:workbench-open-chat-search')).toBe(true);
    vi.restoreAllMocks();
  });

  it('renders empty project list without crashing', () => {
    render(<OuterProjectRail {...makeProps({ projects: [], activeProject: null })} />);
    expect(screen.getByTestId('outer-project-rail')).toBeDefined();
  });
});

describe('projectInitials', () => {
  it('returns first 2 chars uppercased from the last path segment', () => {
    expect(projectInitials('/home/user/my-app')).toBe('MY');
  });

  it('handles Windows-style backslash paths', () => {
    expect(projectInitials('C:\\Users\\dev\\project')).toBe('PR');
  });

  it('returns "?" for empty string', () => {
    expect(projectInitials('')).toBe('?');
  });

  it('handles single-char folder name', () => {
    expect(projectInitials('/a')).toBe('A');
  });
});
