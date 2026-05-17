/**
 * Sidebar navigation configuration.
 *
 * Defines the navigation items, sections, and route mappings
 * for the collapsible sidebar. Items are grouped into logical
 * sections with optional separators between them.
 */

import {
  LayoutDashboard,
  Map,
  Search,
  Bell,
  FileText,
  FlaskConical,
  Database,
  Settings,
  HelpCircle,
} from "lucide-react";
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
        {
          id: "fields",
          label: "Fields",
          icon: Map,
          path: "/fields",
        },
        {
          id: "scouting",
          label: "Scouting",
          icon: Search,
          path: "/scouting",
        },
        {
          id: "alerts",
          label: "Alerts",
          icon: Bell,
          path: "/alerts",
        },
        {
          id: "reports",
          label: "Reports",
          icon: FileText,
          path: "/reports",
        },
        {
          id: "prescription",
          label: "Prescription",
          icon: FlaskConical,
          path: "/prescription",
        },
        {
          id: "data",
          label: "Data",
          icon: Database,
          path: "/data",
        },
      ],
      separator: true,
    },
    {
      id: "system",
      items: [
        {
          id: "settings",
          label: "Settings",
          icon: Settings,
          path: "/settings",
        },
        {
          id: "help",
          label: "Help",
          icon: HelpCircle,
          path: "/help",
        },
      ],
    },
  ],
};
