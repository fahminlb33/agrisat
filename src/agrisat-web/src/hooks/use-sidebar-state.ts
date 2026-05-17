import { useState, useCallback } from "react";

const STORAGE_KEY = "sidebar-collapsed";

function readCollapsedState(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    // Key missing or invalid value — default to expanded
    return false;
  } catch {
    // localStorage unavailable — default to expanded
    return false;
  }
}

function persistCollapsedState(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // localStorage unavailable — continue without persistence
  }
}

/**
 * Manages sidebar collapsed/expanded state with localStorage persistence.
 *
 * - Reads initial state from localStorage key "sidebar-collapsed"
 * - Defaults to expanded (false) if key is missing, invalid, or localStorage is unavailable
 * - Persists state changes to localStorage as "true" or "false"
 *
 * @returns A tuple of [collapsed, toggleCollapse]
 */
export function useSidebarState(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedState);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsedState(next);
      return next;
    });
  }, []);

  return [collapsed, toggleCollapse];
}
