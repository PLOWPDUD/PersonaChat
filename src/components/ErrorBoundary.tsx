import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let displayMessage = this.state.error?.message || 'An unexpected error occurred.';
      let isJsonError = false;
      
      try {
        if (displayMessage.startsWith('{')) {
          const parsed = JSON.parse(displayMessage);
          displayMessage = `Firestore Error: ${parsed.error}\nOperation: ${parsed.operationType}\nPath: ${parsed.path}`;
          isJsonError = true;
        }
      } catch (e) {
        // Not JSON, keep original message
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/20 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-zinc-400 mb-6">
              The application encountered an error. You can try reloading the page or copy the error details below to report the issue.
            </p>
            
            <div className="relative group">
              <pre className="bg-zinc-950 p-4 rounded-xl text-xs text-red-400 overflow-auto max-h-64 border border-zinc-800 font-mono">
                {displayMessage}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(this.state.error?.message || '');
                  alert('Error details copied to clipboard!');
                }}
                className="absolute top-2 right-2 p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy full error details"
              >
                <div className="flex items-center gap-2 text-[10px] font-medium">
                  Copy Details
                </div>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-white hover:bg-zinc-200 text-black font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-6 rounded-xl transition-all"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
