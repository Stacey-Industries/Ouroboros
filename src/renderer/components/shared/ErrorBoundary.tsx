import log from 'electron-log/renderer';
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional label shown in the fallback UI to identify which section crashed. */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React Error Boundary that catches render errors in its subtree.
 *
 * Without this, a single component crash causes React to retry rendering
 * synchronously in a tight loop, freezing the entire renderer (including DevTools).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error(
      `ErrorBoundary${this.props.label ? `:${this.props.label}` : ''} caught:`,
      error,
      info.componentStack,
    );
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-6 text-center text-text-semantic-muted"
          style={{ minHeight: 120 }}
        >
          <span className="text-sm font-medium text-status-error">
            {this.props.label ?? 'Component'} crashed
          </span>
          <span className="text-xs text-text-semantic-muted">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </span>
          <button
            className="mt-1 rounded px-3 py-1 text-xs bg-surface-raised border border-border-semantic text-text-semantic-primary"
            style={{ cursor: 'pointer' }}
            onClick={this.handleRetry}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
