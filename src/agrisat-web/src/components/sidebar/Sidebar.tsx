import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";
import { navigationConfig } from "#/config/navigation";
import type { NavItem, NavSection } from "#/types/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Navigation sections */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {navigationConfig.sections.map((section, index) => (
          <SidebarSection
            key={section.id}
            section={section}
            collapsed={collapsed}
            isLast={index === navigationConfig.sections.length - 1}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon collapsed={collapsed} />
          {!collapsed && (
            <span className="truncate">
              {collapsed ? "Expand" : "Collapse"}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

// -----------------------------------------------------------
// Section
// -----------------------------------------------------------

interface SidebarSectionProps {
  section: NavSection;
  collapsed: boolean;
  isLast: boolean;
}

function SidebarSection({ section, collapsed, isLast }: SidebarSectionProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {section.items.map((item) => (
        <SidebarNavItem key={item.id} item={item} collapsed={collapsed} />
      ))}
      {section.separator && !isLast && (
        <div className="my-2 border-t border-sidebar-border" />
      )}
    </div>
  );
}

// -----------------------------------------------------------
// NavItem
// -----------------------------------------------------------

interface SidebarNavItemProps {
  item: NavItem;
  collapsed: boolean;
}

function SidebarNavItem({ item, collapsed }: SidebarNavItemProps) {
  const Icon = item.icon;

  // Determine tooltip content and delay
  const tooltipContent = item.disabled
    ? item.tooltip || `${item.label} is unavailable`
    : item.label;
  const tooltipDelay = item.disabled ? 0 : 300;

  // Show tooltip when collapsed (always) or when disabled (always)
  const showTooltip = collapsed || item.disabled;

  const linkElement = item.disabled ? (
    <div
      role="link"
      aria-disabled="true"
      tabIndex={-1}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium opacity-50",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon className="h-5 w-5" />
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </div>
  ) : (
    <Link
      to={item.path}
      activeProps={{
        className: "bg-sidebar-accent text-sidebar-accent-foreground",
      }}
      inactiveProps={{
        className: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      }}
      className="group block rounded-md"
    >
      {({ isActive }) => (
        <div
          className={cn(
            "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          {/* Left accent indicator for active state */}
          {isActive && (
            <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-sidebar-primary" />
          )}

          {/* Icon */}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            <Icon className="h-5 w-5" />
            {/* Badge on icon (collapsed mode) */}
            {item.badge != null && item.badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </span>

          {/* Label (expanded only) */}
          {!collapsed && <span className="truncate">{item.label}</span>}

          {/* Badge count text (expanded only) */}
          {!collapsed && item.badge != null && item.badge > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-xs font-medium text-emerald-400">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </div>
      )}
    </Link>
  );

  if (showTooltip) {
    return (
      <TooltipProvider delayDuration={tooltipDelay}>
        <Tooltip>
          <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return linkElement;
}

// -----------------------------------------------------------
// Collapse Icon (chevron)
// -----------------------------------------------------------

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("transition-transform duration-200", collapsed && "rotate-180")}
    >
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}
