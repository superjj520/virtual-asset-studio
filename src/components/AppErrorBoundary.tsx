import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { message?: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("界面运行失败：", error, info.componentStack);
  }

  render() {
    if (!this.state.message) return this.props.children;
    return <main className="app-error-boundary" role="alert">
      <strong>当前界面遇到问题</strong>
      <p>你的本地项目和未保存草稿仍在磁盘中。可以重新加载界面继续。</p>
      <small>{this.state.message}</small>
      <div className="form-actions">
        <button type="button" onClick={() => window.location.reload()}>重新加载界面</button>
      </div>
    </main>;
  }
}
