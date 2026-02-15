import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-surface border border-danger/20 rounded-xl p-4">
            <div className="text-xs text-danger font-medium mb-1">
              {this.props.name || "Card"} Error
            </div>
            <div className="text-[10px] text-text-muted font-mono break-all">
              {this.state.error?.message || "Unknown error"}
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
