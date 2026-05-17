import { useState, useEffect, useCallback } from "react";

/** Breakpoint where sidebar auto-collapses to icon-only */
const TABLET_BREAKPOINT = 1024;

/** Breakpoint where AI panel becomes a full-screen overlay */
const MOBILE_BREAKPOINT = 768;

/** Expanded sidebar width in px */
const SIDEBAR_EXPANDED_WIDTH = 240;

/** Minimum main content width in px */
const MIN_CONTENT_WIDTH = 480;

/** Default AI panel width in px */
const AI_PANEL_WIDTH = 380;

export interface ResponsiveLayoutState {
  /** Whether the sidebar should be forced to collapsed state */
  forceSidebarCollapsed: boolean;
  /** Whether the AI panel should render as a full-screen overlay */
  aiPanelAsOverlay: boolean;
}

/**
 * Computes responsive layout overrides based on viewport width and panel states.
 *
 * Rules:
 * - Viewport < 1024px: force sidebar collapsed (icon-only)
 * - Viewport < 768px: AI panel renders as full-screen overlay
 * - If AI panel is open and viewport cannot fit expanded sidebar (240px) + min content (480px) + AI panel (380px) = 1100px: force sidebar collapsed
 */
export function useResponsiveLayout(aiPanelOpen: boolean): ResponsiveLayoutState {
  const computeState = useCallback(
    (width: number): ResponsiveLayoutState => {
      // Below mobile breakpoint: AI panel is overlay
      const aiPanelAsOverlay = width < MOBILE_BREAKPOINT;

      // Below tablet breakpoint: always collapse sidebar
      if (width < TABLET_BREAKPOINT) {
        return { forceSidebarCollapsed: true, aiPanelAsOverlay };
      }

      // If AI panel is open (and not overlay), check if there's enough room
      // for expanded sidebar + min content + AI panel
      if (aiPanelOpen && !aiPanelAsOverlay) {
        const requiredWidth =
          SIDEBAR_EXPANDED_WIDTH + MIN_CONTENT_WIDTH + AI_PANEL_WIDTH;
        if (width < requiredWidth) {
          return { forceSidebarCollapsed: true, aiPanelAsOverlay };
        }
      }

      return { forceSidebarCollapsed: false, aiPanelAsOverlay };
    },
    [aiPanelOpen],
  );

  const [state, setState] = useState<ResponsiveLayoutState>(() =>
    computeState(typeof window !== "undefined" ? window.innerWidth : 1200),
  );

  useEffect(() => {
    const handleResize = () => {
      setState(computeState(window.innerWidth));
    };

    // Recompute on mount in case SSR width differs
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [computeState]);

  return state;
}
