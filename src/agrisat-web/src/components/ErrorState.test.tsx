/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ErrorState from "./ErrorState";

afterEach(() => {
	cleanup();
});

describe("ErrorState", () => {
	describe("Requirement 10.1: No satellite image variant", () => {
		it("should display 'No satellite image available' message for 404 raster responses", () => {
			render(<ErrorState variant="no-satellite-image" />);

			expect(screen.getByText("No satellite image available")).toBeTruthy();
			expect(
				screen.getByText(/No satellite imagery is available for the selected date/),
			).toBeTruthy();
		});
	});

	describe("Requirement 10.2: No data variant", () => {
		it("should display 'No data available' message with suggestion to expand time range", () => {
			render(<ErrorState variant="no-data" />);

			expect(screen.getByText("No data available")).toBeTruthy();
			expect(
				screen.getByText(/Try expanding the time range/),
			).toBeTruthy();
		});
	});

	describe("Requirement 10.3, 10.6: Retry button after exhausted retries", () => {
		it("should display a retry button when onRetry is provided", () => {
			const onRetry = vi.fn();
			render(<ErrorState variant="network-error" onRetry={onRetry} />);

			const retryButton = screen.getByText("Retry");
			expect(retryButton).toBeTruthy();

			fireEvent.click(retryButton);
			expect(onRetry).toHaveBeenCalledTimes(1);
		});

		it("should not display a retry button when onRetry is not provided", () => {
			render(<ErrorState variant="network-error" />);

			expect(screen.queryByText("Retry")).toBeNull();
		});
	});

	describe("Requirement 10.6: Network error state", () => {
		it("should display service unreachable message for network-error variant", () => {
			render(<ErrorState variant="network-error" onRetry={() => {}} />);

			expect(screen.getByText("Unable to connect")).toBeTruthy();
			expect(
				screen.getByText(/The service is currently unreachable/),
			).toBeTruthy();
			expect(screen.getByText("Retry")).toBeTruthy();
		});
	});

	describe("Requirement 10.4: Stale data indicator", () => {
		it("should show stale data indicator when isStale is true", () => {
			render(<ErrorState variant="network-error" isStale onRetry={() => {}} />);

			expect(
				screen.getByText(/Displaying cached data/),
			).toBeTruthy();
		});

		it("should not show stale data indicator when isStale is false", () => {
			render(<ErrorState variant="network-error" onRetry={() => {}} />);

			expect(screen.queryByText(/Displaying cached data/)).toBeNull();
		});
	});

	describe("Custom title and message overrides", () => {
		it("should use custom title and message when provided", () => {
			render(
				<ErrorState
					variant="generic"
					title="Custom Title"
					message="Custom message text"
				/>,
			);

			expect(screen.getByText("Custom Title")).toBeTruthy();
			expect(screen.getByText("Custom message text")).toBeTruthy();
		});
	});

	describe("Generic variant", () => {
		it("should display generic error message", () => {
			render(<ErrorState variant="generic" />);

			expect(screen.getByText("Something went wrong")).toBeTruthy();
			expect(
				screen.getByText("An unexpected error occurred. Please try again."),
			).toBeTruthy();
		});
	});

	describe("Accessibility", () => {
		it("should have role=alert for screen readers", () => {
			render(<ErrorState variant="no-data" />);

			expect(screen.getByRole("alert")).toBeTruthy();
		});

		it("should have aria-live=assertive", () => {
			render(<ErrorState variant="network-error" />);

			const alert = screen.getByRole("alert");
			expect(alert.getAttribute("aria-live")).toBe("assertive");
		});
	});

	describe("Children rendering", () => {
		it("should render children below the error state", () => {
			render(
				<ErrorState variant="no-data">
					<div>Stale content below</div>
				</ErrorState>,
			);

			expect(screen.getByText("Stale content below")).toBeTruthy();
		});
	});
});
