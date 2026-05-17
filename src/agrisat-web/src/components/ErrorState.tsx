import type { ReactNode } from "react";
import StaleDataIndicator from "./StaleDataIndicator";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export type ErrorVariant =
	| "no-satellite-image"
	| "no-data"
	| "network-error"
	| "generic";

export interface ErrorStateProps {
	/** The type of error to display */
	variant: ErrorVariant;
	/** Optional retry function. When provided, a retry button is shown. */
	onRetry?: () => void;
	/** Whether stale/cached data is being displayed alongside this error */
	isStale?: boolean;
	/** Optional custom title override */
	title?: string;
	/** Optional custom message override */
	message?: string;
	/** Optional children rendered below the error state (e.g., stale data content) */
	children?: ReactNode;
}

// -----------------------------------------------------------
// Variant configuration
// -----------------------------------------------------------

interface VariantConfig {
	icon: ReactNode;
	title: string;
	message: string;
	iconBgClass: string;
	iconColorClass: string;
}

function getVariantConfig(variant: ErrorVariant): VariantConfig {
	switch (variant) {
		case "no-satellite-image":
			return {
				icon: (
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
						<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
						<line x1="9" y1="3" x2="9" y2="21" />
						<line x1="15" y1="3" x2="15" y2="21" />
						<line x1="3" y1="9" x2="21" y2="9" />
						<line x1="3" y1="15" x2="21" y2="15" />
					</svg>
				),
				title: "No satellite image available",
				message:
					"No satellite imagery is available for the selected date and variable. This may be due to cloud cover or data processing delays.",
				iconBgClass: "bg-blue-50",
				iconColorClass: "text-blue-500",
			};

		case "no-data":
			return {
				icon: (
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
						<path d="M3 3h18v18H3z" />
						<path d="M12 8v4" />
						<path d="M12 16h.01" />
					</svg>
				),
				title: "No data available",
				message:
					"No data is available for the selected zone and time range. Try expanding the time range or selecting a different zone.",
				iconBgClass: "bg-[var(--chip-bg)]",
				iconColorClass: "text-[var(--sea-ink-soft)]",
			};

		case "network-error":
			return {
				icon: (
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
						<line x1="2" y1="2" x2="22" y2="22" />
						<path d="M8.5 16.5a5 5 0 0 1 7 0" />
						<path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
						<path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
						<path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
						<path d="M5 12.86a10 10 0 0 1 5.17-2.86" />
						<line x1="12" y1="20" x2="12.01" y2="20" />
					</svg>
				),
				title: "Unable to connect",
				message:
					"The service is currently unreachable. Please check your connection and try again.",
				iconBgClass: "bg-red-50",
				iconColorClass: "text-red-500",
			};

		case "generic":
		default:
			return {
				icon: (
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
				),
				title: "Something went wrong",
				message: "An unexpected error occurred. Please try again.",
				iconBgClass: "bg-red-50",
				iconColorClass: "text-red-500",
			};
	}
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

/**
 * Reusable error state component with multiple variants:
 * - "no-satellite-image": 404 raster response (Requirement 10.1)
 * - "no-data": empty data with suggestion to expand time range (Requirement 10.2)
 * - "network-error": service unreachable after retries exhausted (Requirement 10.6)
 * - "generic": catch-all error state
 *
 * Supports:
 * - Retry button when onRetry is provided (Requirements 10.3, 10.6)
 * - Stale data indicator when isStale is true (Requirement 10.4)
 */
export default function ErrorState({
	variant,
	onRetry,
	isStale = false,
	title: titleOverride,
	message: messageOverride,
	children,
}: ErrorStateProps) {
	const config = getVariantConfig(variant);
	const displayTitle = titleOverride ?? config.title;
	const displayMessage = messageOverride ?? config.message;

	return (
		<div className="flex h-full flex-col" role="alert" aria-live="assertive">
			{/* Stale data indicator at the top when applicable */}
			<StaleDataIndicator visible={isStale} />

			{/* Error content */}
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
				<div
					className={`flex h-12 w-12 items-center justify-center rounded-full ${config.iconBgClass} ${config.iconColorClass}`}
				>
					{config.icon}
				</div>

				<div className="max-w-xs text-center">
					<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
						{displayTitle}
					</h3>
					<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
						{displayMessage}
					</p>
				</div>

				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--link-bg-hover)]"
					>
						Retry
					</button>
				)}
			</div>

			{/* Optional children (e.g., stale data content below the error) */}
			{children}
		</div>
	);
}
