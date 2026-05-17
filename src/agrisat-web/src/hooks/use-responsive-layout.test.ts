/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResponsiveLayout } from "./use-responsive-layout";

describe("useResponsiveLayout", () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  function fireResize() {
    window.dispatchEvent(new Event("resize"));
  }

  describe("Requirement 12.3: Auto-collapse sidebar below 1024px", () => {
    it("should force sidebar collapsed when viewport < 1024px", () => {
      setViewportWidth(1000);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(true);
    });

    it("should not force sidebar collapsed when viewport >= 1024px", () => {
      setViewportWidth(1200);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(false);
    });

    it("should force sidebar collapsed at exactly 1023px", () => {
      setViewportWidth(1023);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(true);
    });

    it("should not force sidebar collapsed at exactly 1024px", () => {
      setViewportWidth(1024);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(false);
    });
  });

  describe("Requirement 12.5: Auto-collapse when AI panel open and not enough space", () => {
    it("should force sidebar collapsed when AI panel open and viewport < 1100px", () => {
      setViewportWidth(1050);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.forceSidebarCollapsed).toBe(true);
    });

    it("should not force sidebar collapsed when AI panel open and viewport >= 1100px", () => {
      setViewportWidth(1200);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.forceSidebarCollapsed).toBe(false);
    });

    it("should not force sidebar collapsed when AI panel closed even at narrow viewport", () => {
      setViewportWidth(1050);
      const { result } = renderHook(() => useResponsiveLayout(false));
      // 1050 >= 1024, so no force collapse when AI panel is closed
      expect(result.current.forceSidebarCollapsed).toBe(false);
    });

    it("should force sidebar collapsed at exactly 1099px with AI panel open", () => {
      setViewportWidth(1099);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.forceSidebarCollapsed).toBe(true);
    });

    it("should not force sidebar collapsed at exactly 1100px with AI panel open", () => {
      setViewportWidth(1100);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.forceSidebarCollapsed).toBe(false);
    });
  });

  describe("Requirement 12.6: AI panel as full-screen overlay below 768px", () => {
    it("should set aiPanelAsOverlay when viewport < 768px", () => {
      setViewportWidth(600);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.aiPanelAsOverlay).toBe(true);
    });

    it("should not set aiPanelAsOverlay when viewport >= 768px", () => {
      setViewportWidth(900);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.aiPanelAsOverlay).toBe(false);
    });

    it("should set aiPanelAsOverlay at exactly 767px", () => {
      setViewportWidth(767);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.aiPanelAsOverlay).toBe(true);
    });

    it("should not set aiPanelAsOverlay at exactly 768px", () => {
      setViewportWidth(768);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.aiPanelAsOverlay).toBe(false);
    });

    it("should not force sidebar collapsed due to AI panel when in overlay mode", () => {
      // At 750px, AI panel is overlay so it doesn't take inline space
      // But 750 < 1024, so sidebar is still forced collapsed due to tablet breakpoint
      setViewportWidth(750);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.forceSidebarCollapsed).toBe(true);
      expect(result.current.aiPanelAsOverlay).toBe(true);
    });
  });

  describe("Responsive updates on resize", () => {
    it("should update state when viewport resizes from wide to narrow", () => {
      setViewportWidth(1200);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(false);

      act(() => {
        setViewportWidth(900);
        fireResize();
      });

      expect(result.current.forceSidebarCollapsed).toBe(true);
    });

    it("should update state when viewport resizes from narrow to wide", () => {
      setViewportWidth(900);
      const { result } = renderHook(() => useResponsiveLayout(false));
      expect(result.current.forceSidebarCollapsed).toBe(true);

      act(() => {
        setViewportWidth(1200);
        fireResize();
      });

      expect(result.current.forceSidebarCollapsed).toBe(false);
    });

    it("should update overlay state on resize across 768px boundary", () => {
      setViewportWidth(800);
      const { result } = renderHook(() => useResponsiveLayout(true));
      expect(result.current.aiPanelAsOverlay).toBe(false);

      act(() => {
        setViewportWidth(700);
        fireResize();
      });

      expect(result.current.aiPanelAsOverlay).toBe(true);
    });
  });
});
