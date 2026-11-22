import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../services/clientErrors';
import { ErrorFallback } from './ErrorFallback';

type ErrorBoundaryProps = {
  children: ReactNode;
  /** When this value changes, a caught error is cleared and the children render again (pass the route path). */
  resetKey?: unknown;
};

type ErrorBoundaryState = {
  error: Error | null;
  resetKey?: unknown;
};

/** Catches a render error in its subtree and shows a Russian fallback instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }

    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
    reportClientError('render', error);
  }

  render() {
    return this.state.error ? <ErrorFallback /> : this.props.children;
  }
}
