/**
 * Sidebar navigation type definitions.
 *
 * These interfaces define the structure for the collapsible
 * icon-based sidebar navigation configuration.
 */

import type { LucideIcon } from "lucide-react";

// -----------------------------------------------------------
// Navigation Item
// -----------------------------------------------------------

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: number;
  disabled?: boolean;
  tooltip?: string;
}

// -----------------------------------------------------------
// Navigation Section
// -----------------------------------------------------------

export interface NavSection {
  id: string;
  items: NavItem[];
  separator?: boolean; // Show divider after this section
}

// -----------------------------------------------------------
// Navigation Configuration
// -----------------------------------------------------------

export interface NavConfig {
  sections: NavSection[];
}
