/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSidebarState } from "./use-sidebar-state";

describe("useSidebarState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Requirement 2.3: Initialize from localStorage", () => {
    it("should default to expanded (false) when localStorage key is missing", () => {
      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(false);
    });

    it("should initialize as collapsed when localStorage has 'true'", () => {
      localStorage.setItem("sidebar-collapsed", "true");
      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(true);
    });

    it("should initialize as expanded when localStorage has 'false'", () => {
      localStorage.setItem("sidebar-collapsed", "false");
      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(false);
    });

    it("should default to expanded when localStorage has an invalid value", () => {
      localStorage.setItem("sidebar-collapsed", "invalid");
      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(false);
    });
  });

  describe("Requirement 2.2: Persist state to localStorage", () => {
    it("should persist 'true' to localStorage when toggled to collapsed", () => {
      const { result } = renderHook(() => useSidebarState());

      act(() => {
        result.current[1](); // toggle from expanded to collapsed
      });

      expect(result.current[0]).toBe(true);
      expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    });

    it("should persist 'false' to localStorage when toggled to expanded", () => {
      localStorage.setItem("sidebar-collapsed", "true");
      const { result } = renderHook(() => useSidebarState());

      act(() => {
        result.current[1](); // toggle from collapsed to expanded
      });

      expect(result.current[0]).toBe(false);
      expect(localStorage.getItem("sidebar-collapsed")).toBe("false");
    });
  });

  describe("Requirement 2.1: Toggle behavior", () => {
    it("should toggle state on each call", () => {
      const { result } = renderHook(() => useSidebarState());

      // Start expanded
      expect(result.current[0]).toBe(false);

      // Toggle to collapsed
      act(() => { result.current[1](); });
      expect(result.current[0]).toBe(true);

      // Toggle back to expanded
      act(() => { result.current[1](); });
      expect(result.current[0]).toBe(false);
    });
  });

  describe("Requirement 2.6: localStorage unavailable", () => {
    it("should default to expanded when localStorage throws on getItem", () => {
      const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(false);

      getItemSpy.mockRestore();
    });

    it("should continue operating when localStorage throws on setItem", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      const { result } = renderHook(() => useSidebarState());

      // Should still toggle state in memory even if persistence fails
      act(() => { result.current[1](); });
      expect(result.current[0]).toBe(true);

      setItemSpy.mockRestore();
    });
  });
});
