/**
 * Sidebar navigation configuration.
 *
 * Defines the navigation items, sections, and route mappings
 * for the collapsible sidebar. Items are grouped into logical
 * sections with optional separators between them.
 */

import { LayoutDashboard } from "lucide-react";
import type { NavConfig } from "#/types/sidebar";

export const navigationConfig: NavConfig = {
  sections: [
    {
      id: "main",
      items: [
        {
          id: "overview",
          label: "Overview",
          icon: LayoutDashboard,
          path: "/",
        },
      ],
    },
  ],
};
