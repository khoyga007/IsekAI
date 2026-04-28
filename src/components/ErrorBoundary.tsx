import { Component, type ReactNode, type ErrorInfo } from "react";
import { translate } from "@/lib/i18n";
import { useSettings } from "@/state/settings";
import { useCampaign } from "@/state/campaign";

interface Props {
  children: ReactNode;
  /** When true, render a compact inline panel instead of fullscreen takeover. */
  inline?: boolean;
  /** Optional label shown in inline mode (e.g. "Story panel"). */
  label?: string;
  /** When this value changes, the error state clears. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  showStack: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showStack: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[IsekAI ErrorBoundary]", error, info);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, showStack: false });
    }
  }

  private t = (k: string) => translate(useSettings.getState().ui.lang, k);
  private reset = () => this.setState({ error: null, showStack: false });
  private reload = () => window.location.reload();
  private closeCampaign = () => {
    try { useCampaign.getState().closeCampaign(); } catch (e) { console.error(e); }
    this.reset();
  };

  render() {
    const { error, showStack } = this.state;
    if (!error) return this.props.children;

    if (this.props.inline) {
      return (
        <div className="m-3 p-3 rounded-xl glass" style={{ borderColor: "var(--color-vermillion)" }}>
          <div className="text-sm font-display mb-1" style={{ color: "var(--color-vermillion)" }}>
            ! {this.props.label ?? this.t("err.inline")}
          </div>
          <div className="text-[11px] font-mono opacity-70 break-all mb-2">{error.message}</div>
          <button onClick={this.reset} className="text-xs px-3 py-1 rounded-full edge-neon">
            {this.t("err.btn.retry")}
          </button>
        </div>
      );
    }

    const hasCampaign = !!useCampaign.getState().current;
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-6 bg-ink-wash text-center px-8">
        <div className="font-display text-5xl font-bold" style={{ color: "var(--color-vermillion)" }}>!</div>
        <div className="max-w-xl">
          <div className="font-display text-xl mb-2">{this.t("err.title")}</div>
          <div className="text-xs font-mono opacity-70 break-all" style={{ color: "var(--color-text-dim)" }}>
            {error.message}
          </div>
          {showStack && error.stack && (
            <pre className="mt-3 text-[10px] font-mono opacity-50 whitespace-pre-wrap break-all max-h-60 overflow-auto text-left p-2 rounded-lg glass">
              {error.stack}
            </pre>
          )}
          <button
            onClick={() => this.setState({ showStack: !showStack })}
            className="mt-3 text-[10px] underline opacity-60"
          >
            {showStack ? this.t("err.btn.hideStack") : this.t("err.btn.showStack")}
          </button>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <button onClick={this.reset} className="px-5 py-2 rounded-full edge-neon text-sm">
            {this.t("err.btn.retry")}
          </button>
          {hasCampaign && (
            <button onClick={this.closeCampaign} className="px-5 py-2 rounded-full glass text-sm">
              {this.t("err.btn.close")}
            </button>
          )}
          <button
            onClick={this.reload}
            className="px-5 py-2 rounded-full text-sm"
            style={{ background: "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" }}
          >
            {this.t("err.btn.reload")}
          </button>
        </div>
      </div>
    );
  }
}
