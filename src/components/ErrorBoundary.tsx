import { Component, type ErrorInfo, type ReactNode } from "react";
import { BootError } from "./BootScreen";

type Props = { children: ReactNode };
type State = { error: unknown };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[polaris] render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <BootError
          title="Terjadi kesalahan"
          step="Menampilkan halaman"
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
