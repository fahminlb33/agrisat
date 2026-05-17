import { useState } from "react";
import { Bot } from "lucide-react";
import { Sidebar } from "#/components/sidebar/Sidebar";
import { AIAssistantPanel } from "#/components/ai/AIAssistantPanel";
import ThemeToggle from "#/components/ThemeToggle";
import { useSidebarState } from "#/hooks/use-sidebar-state";
import { useResponsiveLayout } from "#/hooks/use-responsive-layout";
import { cn } from "#/lib/utils";
import { Button } from "#/components/ui/button";

export interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Three-column application layout: Sidebar (left) | Main Content (center) | AI Panel (right).
 *
 * - Sidebar collapsed state is managed via `useSidebarState` (localStorage-persisted).
 * - Responsive breakpoints override user preference:
 *   - Viewport < 1024px: sidebar forced to collapsed (icon-only)
 *   - Viewport < 1100px with AI panel open: sidebar forced to collapsed
 *   - Viewport < 768px: AI panel renders as full-screen overlay
 * - AI panel is toggled via a button in the top bar area.
 * - Main content retains a minimum width of 480px when both panels are active.
 * - Panel open/close transitions use 200ms CSS transitions with zero layout shift.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, toggleSidebarCollapse] = useSidebarState();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const { forceSidebarCollapsed, aiPanelAsOverlay } =
    useResponsiveLayout(aiPanelOpen);

  // Effective collapsed state: user preference OR responsive override
  const effectiveCollapsed = sidebarCollapsed || forceSidebarCollapsed;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: Sidebar Navigation */}
      <Sidebar
        collapsed={effectiveCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* Center + Right wrapper */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with theme toggle and AI toggle */}
        <div className="flex h-10 shrink-0 items-center justify-end border-b border-sidebar-border bg-sidebar px-3 gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAiPanelOpen((prev) => !prev)}
            aria-label={aiPanelOpen ? "Close AI assistant" : "Open AI assistant"}
            className="gap-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">AI Assistant</span>
          </Button>
        </div>

        {/* Content + AI Panel row */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <main
            className={cn(
              "flex-1 overflow-auto transition-all duration-200",
              "min-w-[480px]",
            )}
          >
            {children}
          </main>

          {/* Right: AI Assistant Panel — inline mode (viewport >= 768px) */}
          {!aiPanelAsOverlay && (
            <AIAssistantPanel
              open={aiPanelOpen}
              onClose={() => setAiPanelOpen(false)}
            />
          )}

          {/* Right: AI Assistant Panel — full-screen overlay mode (viewport < 768px) */}
          {aiPanelAsOverlay && aiPanelOpen && (
            <div
              className="fixed inset-0 z-50 flex flex-col bg-card"
              role="dialog"
              aria-modal="true"
            >
              <AIAssistantPanel
                open={true}
                onClose={() => setAiPanelOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
