import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { FirestoreErrorInfo } from '../../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  firestoreError: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      firestoreError: null,
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let parsedFirestore: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(rawMsg) as Partial<FirestoreErrorInfo>;
      if (candidate && typeof candidate.error === 'string' && candidate.operationType) {
        parsedFirestore = candidate as FirestoreErrorInfo;
      }
    } catch {
      parsedFirestore = null;
    }

    return {
      hasError: true,
      errorMessage: rawMsg,
      firestoreError: parsedFirestore,
    };
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '', firestoreError: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { firestoreError, errorMessage } = this.state;
    const isPermissionDenied =
      firestoreError &&
      (firestoreError.error.toLowerCase().includes('permission') ||
        firestoreError.error.toLowerCase().includes('insufficient'));

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                {isPermissionDenied
                  ? 'Cloud Access Permission Restricted'
                  : 'Unexpected Application Error'}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {isPermissionDenied
                  ? 'Your current session could not complete a restricted cloud database action. Ensure you are signed in with an authorized school staff Google account.'
                  : 'An unexpected error occurred while processing school data.'}
              </p>

              {firestoreError ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                  <p>
                    <span className="font-semibold text-slate-900">Operation:</span>{' '}
                    <span className="font-mono">{firestoreError.operationType}</span>
                    {firestoreError.path ? ` (${firestoreError.path})` : ''}
                  </p>
                  <p className="break-words text-rose-700">{firestoreError.error}</p>
                </div>
              ) : (
                errorMessage && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-rose-700 break-words">
                    {errorMessage}
                  </div>
                )
              )}

              <div className="mt-5">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reload Workspace</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
