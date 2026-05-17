/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import StaleDataIndicator from "./StaleDataIndicator";

afterEach(() => {
	cleanup();
});

describe("StaleDataIndicator", () => {
	describe("Requirement 10.4: Stale data visibility", () => {
		it("should display the stale data banner when visible is true", () => {
			render(<StaleDataIndicator visible />);

			expect(
				screen.getByText(/Displaying cached data — information may be outdated/),
			).toBeTruthy();
		});

		it("should not display anything when visible is false and no children", () => {
			const { container } = render(<StaleDataIndicator visible={false} />);

			expect(container.innerHTML).toBe("");
		});

		it("should render children when visible is false", () => {
			render(
				<StaleDataIndicator visible={false}>
					<div>Child content</div>
				</StaleDataIndicator>,
			);

			expect(screen.getByText("Child content")).toBeTruthy();
			expect(screen.queryByText(/Displaying cached data/)).toBeNull();
		});

		it("should render both indicator and children when visible is true", () => {
			render(
				<StaleDataIndicator visible>
					<div>Data content</div>
				</StaleDataIndicator>,
			);

			expect(
				screen.getByText(/Displaying cached data/),
			).toBeTruthy();
			expect(screen.getByText("Data content")).toBeTruthy();
		});
	});

	describe("Custom message", () => {
		it("should display a custom message when provided", () => {
			render(
				<StaleDataIndicator visible message="Data from 5 minutes ago" />,
			);

			expect(screen.getByText("Data from 5 minutes ago")).toBeTruthy();
		});
	});

	describe("Accessibility", () => {
		it("should have role=status for non-intrusive announcement", () => {
			render(<StaleDataIndicator visible />);

			expect(screen.getByRole("status")).toBeTruthy();
		});

		it("should have aria-live=polite", () => {
			render(<StaleDataIndicator visible />);

			const status = screen.getByRole("status");
			expect(status.getAttribute("aria-live")).toBe("polite");
		});

		it("should have an aria-label for the stale data warning", () => {
			render(<StaleDataIndicator visible />);

			const status = screen.getByRole("status");
			expect(status.getAttribute("aria-label")).toBe("Stale data warning");
		});
	});
});
