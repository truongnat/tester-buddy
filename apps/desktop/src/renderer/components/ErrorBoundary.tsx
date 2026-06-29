import { Component } from "react";
import { Button } from "./ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-screen gap-3 p-8 text-center bg-bg">
          <div className="p-4 rounded-full bg-error/10 border border-error/30">
            <span className="text-error text-xl font-bold">!</span>
          </div>
          <h2 className="text-sm font-semibold text-text">Something went wrong</h2>
          <p className="text-xs text-text-muted max-w-md">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <Button size="sm" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}