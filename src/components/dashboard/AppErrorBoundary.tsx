import { Component, type ReactNode } from "react";

/** Last line of defence: one mono line, tap to reload. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-mono text-[13px] text-muted"
        >
          something broke — reload
        </button>
      </div>
    );
  }
}
