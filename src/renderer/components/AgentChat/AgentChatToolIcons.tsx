/**
 * AgentChatToolIcons.tsx — SVG icon builders for each tool type.
 * Extracted from AgentChatToolCardSupport.tsx to stay under 300-line limit.
 */
import React from 'react';

type IconBuilder = { names: Set<string>; render: () => React.ReactElement };

const S = 'h-3.5 w-3.5 shrink-0 text-text-semantic-muted';
const svgProps = { className: S, viewBox: '0 0 14 14', fill: 'none' } as const;
const p = {
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const TOOL_ICON_BUILDERS: IconBuilder[] = [
  {
    names: new Set(['Read', 'read_file']),
    render: () => (
      <svg {...svgProps}>
        <path d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z" {...p} />
        <path d="M5 5.5h4M5 8h3" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit']),
    render: () => (
      <svg {...svgProps}>
        <path d="M8.5 2l3 3-7.5 7.5H1v-3L8.5 2z" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['Write', 'write_file', 'create_file']),
    render: () => (
      <svg {...svgProps}>
        <path d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z" {...p} />
        <path d="M7 5v4M5 7h4" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['Bash', 'execute_command']),
    render: () => (
      <svg {...svgProps}>
        <rect
          x="1"
          y="2"
          width="12"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M3.5 5.5l2 1.5-2 1.5M7 9h3" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['Grep', 'search_files']),
    render: () => (
      <svg {...svgProps}>
        <circle
          cx="6"
          cy="6"
          r="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.5 9.5l3 3" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['Glob', 'find_files']),
    render: () => (
      <svg {...svgProps}>
        <path
          d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h5a1 1 0 011 1v6a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-6.5z"
          {...p}
        />
        <circle
          cx="8"
          cy="7.5"
          r="2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['WebSearch']),
    render: () => (
      <svg {...svgProps}>
        <circle
          cx="7"
          cy="7"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M1.5 7h11M7 1.5c-2 2-2 9 0 11M7 1.5c2 2 2 9 0 11" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['WebFetch']),
    render: () => (
      <svg {...svgProps}>
        <path d="M7 2v7M4 6l3 3 3-3" {...p} />
        <path d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['TodoWrite']),
    render: () => (
      <svg {...svgProps}>
        <rect
          x="2"
          y="1.5"
          width="10"
          height="11"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M4.5 5l1 1 2-2M4.5 9h5" {...p} />
      </svg>
    ),
  },
  {
    names: new Set(['NotebookEdit']),
    render: () => (
      <svg {...svgProps}>
        <rect
          x="2.5"
          y="1"
          width="9"
          height="12"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M5 1v12M5 4.5h5M5 7.5h5" {...p} />
      </svg>
    ),
  },
];
