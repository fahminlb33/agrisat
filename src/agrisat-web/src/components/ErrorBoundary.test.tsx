/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useEffect } from "react";

afterEach(() => {
    cleanup();
});

// A component that throws an error on render
function ThrowingComponent({ error }: { error: Error }) {
    useEffect(() => {

        throw error;
    }, [])

    return <></>
}

// A component that renders normally
function GoodComponent() {
    return <div>All good</div>;
}

describe("ErrorBoundary", () => {
    // Suppress React error boundary console.error noise in tests
    const originalConsoleError = console.error;
    beforeAll(() => {
        console.error = (...args: unknown[]) => {
            const msg = typeof args[0] === "string" ? args[0] : "";
            if (msg.includes("React will try to recreate") || msg.includes("The above error")) {
                return;
            }
            originalConsoleError(...args);
        };
    });
    afterAll(() => {
        console.error = originalConsoleError;
    });

    it("should render children when no error occurs", () => {
        render(
            <ErrorBoundary>
                <GoodComponent />
            </ErrorBoundary>,
        );

        expect(screen.getByText("All good")).toBeTruthy();
    });

    it("should display fallback UI when a child throws an error", () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent error={new Error("Test error")} />
            </ErrorBoundary>,
        );

        expect(screen.getByRole("alert")).toBeTruthy();
        expect(screen.getByText("Something went wrong")).toBeTruthy();
        expect(screen.getByText("Test error")).toBeTruthy();
    });

    it("should display a retry button that resets the error state", () => {
        let shouldThrow = true;

        function ConditionalComponent() {
            if (shouldThrow) {
                throw new Error("Oops");
            }
            return <div>All good</div>;
        }

        render(
            <ErrorBoundary>
                <ConditionalComponent />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Something went wrong")).toBeTruthy();

        // Click retry — this resets the error state
        const retryButton = screen.getByText("Try again");
        expect(retryButton).toBeTruthy();

        // Fix the condition so the child no longer throws, then click retry
        shouldThrow = false;
        fireEvent.click(retryButton);

        expect(screen.getByText("All good")).toBeTruthy();
    });

    it("should render custom fallback when provided", () => {
        render(
            <ErrorBoundary fallback={<div>Custom fallback</div>}>
                <ThrowingComponent error={new Error("Fail")} />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Custom fallback")).toBeTruthy();
    });

    it("should call onError callback when an error is caught", () => {
        const onError = vi.fn();
        render(
            <ErrorBoundary onError={onError}>
                <ThrowingComponent error={new Error("Callback test")} />
            </ErrorBoundary>,
        );

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Callback test" }),
            expect.objectContaining({ componentStack: expect.any(String) }),
        );
    });

    it("should recover when retry is clicked and child no longer throws", () => {
        let shouldThrow = true;

        function ConditionalThrower() {
            if (shouldThrow) {
                throw new Error("Conditional error");
            }
            return <div>Recovered</div>;
        }

        render(
            <ErrorBoundary>
                <ConditionalThrower />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Something went wrong")).toBeTruthy();

        // Fix the condition and click retry
        shouldThrow = false;
        fireEvent.click(screen.getByText("Try again"));

        expect(screen.getByText("Recovered")).toBeTruthy();
    });
});
