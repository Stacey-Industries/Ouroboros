import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens (CSS custom properties — resolve at runtime)
        'surface': {
          base:    'var(--surface-base)',
          panel:   'var(--surface-panel)',
          raised:  'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          inset:   'var(--surface-inset)',
        },
        'text-semantic': {
          primary:     'var(--text-primary)',
          secondary:   'var(--text-secondary)',
          muted:       'var(--text-muted)',
          faint:       'var(--text-faint)',
          'on-accent': 'var(--text-on-accent)',
        },
        'border-semantic': {
          DEFAULT: 'var(--border-default)',
          subtle:  'var(--border-subtle)',
          accent:  'var(--border-accent)',
        },
        'interactive': {
          accent:    'var(--interactive-accent)',
          hover:     'var(--interactive-hover)',
          muted:     'var(--interactive-muted)',
          selection: 'var(--interactive-selection)',
          focus:     'var(--interactive-focus)',
        },
        'status': {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          error:   'var(--status-error)',
          info:    'var(--status-info)',
        },
        // Static design tokens (GitHub dark / Monokai inspired)
        'surface-static': {
          DEFAULT: '#0d1117',
          raised: '#161b22',
          overlay: '#1c2128',
          border: '#30363d'
        },
        // Accent — semantic action colours
        accent: {
          blue: '#58a6ff',
          'blue-muted': '#1f6feb',
          green: '#3fb950',
          'green-muted': '#238636',
          orange: '#d29922',
          'orange-muted': '#9e6a03',
          red: '#f85149',
          'red-muted': '#da3633',
          purple: '#bc8cff',
          'purple-muted': '#8957e5'
        },
        // Ink — text hierarchy
        ink: {
          DEFAULT: '#e6edf3',
          muted: '#8b949e',
          faint: '#484f58',
          inverse: '#0d1117'
        }
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'Geist Mono',
          'Hack',
          'IBM Plex Mono',
          'Cascadia Code',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ],
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }]
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' }
        }
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-down': 'slide-down 200ms ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

export default config
