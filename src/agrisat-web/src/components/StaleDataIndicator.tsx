import type { ReactNode } from "react";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface StaleDataIndicatorProps {
	/** Whether to show the stale data indicator */
	visible: boolean;
	/** Optional custom message. Defaults to a generic stale data message. */
	message?: string;
	/** Optional children to render alongside the indicator */
	children?: ReactNode;
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

/**
 * A small banner/badge component that indicates data is stale (from cache).
 *
 * Shown when the frontend is displaying cached data during a network failure.
 * Satisfies Requirement 10.4: show a visible indicator informing the user
 * that the displayed data may be outdated.
 */
export default function StaleDataIndicator({
	visible,
	message = "Displaying cached data — information may be outdated.",
	children,
}: StaleDataIndicatorProps) {
	if (!visible) {
		return children ?? null;
	}

	return (
		<>
			<div
				className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-800"
				role="status"
				aria-live="polite"
				aria-label="Stale data warning"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					className="flex-shrink-0"
				>
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
				<span>{message}</span>
			</div>
			{children}
		</>
	);
}
