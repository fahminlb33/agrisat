import { Component, type ErrorInfo, type ReactNode } from "react";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface ErrorBoundaryProps {
	/** Content to render when no error has occurred */
	children: ReactNode;
	/** Optional custom fallback UI. If not provided, a default error state is shown. */
	fallback?: ReactNode;
	/** Called when an error is caught, useful for logging */
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

/**
 * React error boundary that catches render errors in its subtree
 * and displays a fallback UI with a retry button.
 *
 * Satisfies Requirements 10.6: display an error state without rendering
 * a blank or broken panel.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.props.onError?.(error, errorInfo);
	}

	handleRetry = (): void => {
		this.setState({ hasError: false, error: null });
	};

	render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div
					className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--header-bg)] p-6"
					role="alert"
					aria-live="assertive"
				>
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>

					<div className="text-center">
						<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
							Something went wrong
						</h3>
						<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
							{this.state.error?.message ?? "An unexpected error occurred."}
						</p>
					</div>

					<button
						type="button"
						onClick={this.handleRetry}
						className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--link-bg-hover)]"
					>
						Try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
