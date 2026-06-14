import { useState } from "react";
import { Bot, Leaf } from "lucide-react";
import { AIAssistantPanel } from "#/components/ai/AIAssistantPanel";
import ThemeToggle from "#/components/ThemeToggle";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useControls } from "#/components/sections/fullscreen";
import {
	MapOverlay,
	ZoneSearch,
	ZoneHUD,
	WeatherWidget,
	BottomBar,
} from "#/components/sections/fullscreen";
import type { Level, Zone, Variable } from "#/services/api";

export interface ImmersiveLayoutProps {
	levels: Level[];
	zones: Zone[];
	variables: Variable[];
	hasDataError?: boolean;
}

export function ImmersiveLayout({
	levels,
	zones,
	variables,
	hasDataError,
}: ImmersiveLayoutProps) {
	const aiPanelOpen = useControls((s) => s.aiPanelOpen);
	const openAiPanel = useControls((s) => s.openAiPanel);
	const closeAiPanel = useControls((s) => s.closeAiPanel);

	const [aiExpanded, setAiExpanded] = useState(false);

	return (
		<div className="fixed inset-0 z-50 h-screen w-full overflow-hidden bg-background text-foreground">
			{/* Full-screen map — self-contained */}
			<MapOverlay zones={zones} />

			{/* Zone selector — self-contained */}
			<ZoneSearch levels={levels} zones={zones} />

			{/* Logo + theme toggle — top left */}
			<div className="absolute top-4 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<div className="flex items-center gap-2">
					<a
						href="/dashboard"
						className="flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl"
					>
						<Leaf className="h-5 w-5 text-emerald-500" />
						<span className="hidden sm:inline text-sm font-semibold text-foreground">AgriSat</span>
					</a>
					<ThemeToggle variant="floating" />
				</div>
			</div>

			{/* Weather widget — top right, self-contained */}
			<div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-right-4 duration-300">
				<WeatherWidget />
			</div>

			{/* Zone HUD — middle left, self-contained */}
			<ZoneHUD zones={zones} levels={levels} variables={variables} />

			{/* Bottom bar — self-contained */}
			<BottomBar levels={levels} zones={zones} variables={variables} />

			{/* AI Assistant button — bottom left, sits above the bottom bar */}
			<div className="absolute bottom-[4.5rem] md:bottom-5 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<Button
					variant="ghost"
					onClick={openAiPanel}
					aria-label="Open AI Assistant"
					className="rounded-xl bg-background/95 px-3 py-2.5 h-auto shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl hover:bg-background/95 gap-2"
				>
					<Bot className="h-4 w-4 text-emerald-500" />
					<span className="text-xs font-medium text-foreground">AI</span>
				</Button>
			</div>

			{/* AI Assistant Panel overlay */}
			{aiPanelOpen && (
				<div
					className={cn(
						"absolute z-30 overflow-hidden rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 animate-in slide-in-from-bottom-8 duration-300 transition-[width,height]",
						"[&>aside]:h-full [&>aside]:w-full [&>aside]:border-l-0",
						// Mobile: full screen overlay
						"inset-0 rounded-none sm:inset-auto",
						// Desktop: floating panel above bottom bar
						aiExpanded
							? "sm:bottom-[5.5rem] sm:left-4 sm:h-[70vh] sm:w-[820px] sm:rounded-xl"
							: "sm:bottom-[5.5rem] sm:left-4 sm:h-[70vh] sm:w-[380px] sm:rounded-xl",
					)}
				>
					<AIAssistantPanel
						open={aiPanelOpen}
						onClose={closeAiPanel}
						expanded={aiExpanded}
						onExpandedChange={setAiExpanded}
					/>
				</div>
			)}

			{/* Data error notice */}
			{hasDataError && (
				<div className="absolute top-4 left-4 z-20 animate-in fade-in duration-300">
					<div className="rounded-lg bg-amber-50/95 px-3 py-2 text-xs text-amber-700 shadow-md backdrop-blur-md dark:bg-amber-950/90 dark:text-amber-300">
						Unable to load zone data
					</div>
				</div>
			)}
		</div>
	);
}
