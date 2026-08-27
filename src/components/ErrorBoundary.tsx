import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home, Copy, Check, Terminal, ShieldAlert } from 'lucide-react';
import { loadLatestSessionSnapshot } from '../lib/indexedDbStorage';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  isRestoring: boolean;
  restoreMessage: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      isRestoring: false,
      restoreMessage: null
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, restoreMessage: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, restoreMessage: null });
    window.location.hash = '';
    window.location.reload();
  };

  private handleRestoreSession = async () => {
    this.setState({ isRestoring: true, restoreMessage: null });
    try {
      const snapshot = await loadLatestSessionSnapshot();
      if (snapshot && snapshot.appData) {
        Object.entries(snapshot.appData).forEach(([k, v]) => {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
        window.location.reload();
      } else {
        this.setState({ restoreMessage: 'No previous auto-saved snapshot was found in storage.' });
      }
    } catch (err: any) {
      this.setState({ restoreMessage: `Failed to restore snapshot: ${err.message || 'Unknown error'}` });
      console.error('Failed to restore snapshot:', err);
    } finally {
      this.setState({ isRestoring: false });
    }
  };

  private handleCopyDiagnostic = () => {
    const report = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] w-full p-6 sm:p-8 flex items-center justify-center bg-[#0a0a0a] text-white">
          <div className="max-w-2xl w-full bg-[#141414] border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl shrink-0">
                <AlertOctagon className="w-8 h-8 text-rose-400" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-widest text-rose-400 font-bold block">
                  Application Fault Intercepted
                </span>
                <h3 className="text-xl font-serif italic text-white font-bold">
                  {this.props.fallbackTitle || 'A component error occurred'}
                </h3>
                <p className="text-xs text-white/60">
                  GeoStudio caught a rendering or computational exception. Your workspace and session state remain preserved in IndexedDB.
                </p>
              </div>
            </div>

            {/* Error Message Snippet */}
            <div className="p-4 bg-black/60 rounded-xl border border-white/10 font-mono text-xs text-rose-300 overflow-x-auto">
              <p className="font-bold">{this.state.error?.name}: {this.state.error?.message}</p>
            </div>

            {this.state.restoreMessage && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{this.state.restoreMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="py-2.5 px-4 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#c9a063]/10"
              >
                <RotateCcw className="w-4 h-4" /> Retry Workspace
              </button>

              <button
                onClick={this.handleRestoreSession}
                disabled={this.state.isRestoring}
                className="py-2.5 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <ShieldAlert className="w-4 h-4" /> {this.state.isRestoring ? 'Restoring...' : 'Restore Auto-Save'}
              </button>

              <button
                onClick={this.handleGoHome}
                className="py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Home className="w-4 h-4 text-white/60" /> Home & Projects
              </button>
            </div>

            {/* Diagnostic Details Accordion */}
            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-white/40 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" /> Technical Diagnostics
                </span>
                <button
                  onClick={this.handleCopyDiagnostic}
                  className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
                >
                  {this.state.copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Copied Details
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Error Trace
                    </>
                  )}
                </button>
              </div>

              {this.state.error?.stack && (
                <details className="text-[11px] text-white/40 font-mono bg-black/40 p-3 rounded-lg border border-white/5 cursor-pointer">
                  <summary className="hover:text-white/70">View Stack Trace</summary>
                  <pre className="mt-2 whitespace-pre-wrap overflow-x-auto text-[10px] text-white/50">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
