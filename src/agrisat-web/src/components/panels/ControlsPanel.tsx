import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface ZoneLevel {
	levelId: number;
	level: string;
}

export interface Zone {
	zoneId: number;
	levelId: number;
	level: string;
	name: string;
	city: string;
	area: number;
}

export interface Variable {
	variableId: number;
	type: "static" | "dynamic";
	category:
		| "vegetation"
		| "chlorophyll"
		| "water_stress"
		| "topography"
		| "true-color";
	key: string;
	name: string;
	description: string;
}

export interface ControlsPanelProps {
	levels: ZoneLevel[];
	zones: Zone[];
	variables: Variable[];
	store: ReturnType<typeof import("#/stores/query-context").createQueryContextStore>;
	/** Whether layer data is loading (polygon fetch in progress) */
	isLayerLoading?: boolean;
}

// -----------------------------------------------------------
// Constants
// -----------------------------------------------------------

const CATEGORY_ORDER: Variable["category"][] = [
	"vegetation",
	"chlorophyll",
	"water_stress",
	"topography",
	"true-color",
];

const CATEGORY_LABELS: Record<Variable["category"], string> = {
	vegetation: "Vegetation",
	chlorophyll: "Chlorophyll",
	water_stress: "Water Stress",
	topography: "Topography",
	"true-color": "True Color",
};

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export default memo(function ControlsPanel({
	levels,
	zones,
	variables,
	store,
	isLayerLoading,
}: ControlsPanelProps) {
	const levelId = useStore(store, (s) => s.levelId);
	const zoneId = useStore(store, (s) => s.zoneId);
	const variableIds = useStore(store, (s) => s.variableIds);
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	const setLevel = useStore(store, (s) => s.setLevel);
	const setZone = useStore(store, (s) => s.setZone);
	const toggleVariable = useStore(store, (s) => s.toggleVariable);
	const setActiveVariable = useStore(store, (s) => s.setActiveVariable);

	const [zoneSearch, setZoneSearch] = useState("");
	const hasInitialized = useRef(false);

	// -----------------------------------------------------------
	// Default: pre-select all vegetation variables on first load (Req 4.7)
	// -----------------------------------------------------------
	useEffect(() => {
		if (hasInitialized.current) return;
		if (variables.length === 0) return;

		const vegetationVars = variables.filter(
			(v) => v.category === "vegetation",
		);

		if (vegetationVars.length > 0) {
			for (const v of vegetationVars) {
				toggleVariable(v.variableId);
			}
			setActiveVariable(vegetationVars[0].variableId);
		}

		hasInitialized.current = true;
	}, [variables, toggleVariable, setActiveVariable]);

	// -----------------------------------------------------------
	// Derived state
	// -----------------------------------------------------------

	const filteredZones = useMemo(() => {
		let filtered = zones;

		if (levelId !== null) {
			filtered = filtered.filter((z) => z.levelId === levelId);
		}

		if (zoneSearch.trim()) {
			const term = zoneSearch.toLowerCase().trim();
			filtered = filtered.filter(
				(z) =>
					z.name.toLowerCase().includes(term) ||
					z.city.toLowerCase().includes(term),
			);
		}

		return filtered;
	}, [zones, levelId, zoneSearch]);

	const groupedVariables = useMemo(() => {
		const groups = new Map<Variable["category"], Variable[]>();
		for (const cat of CATEGORY_ORDER) {
			const items = variables.filter((v) => v.category === cat);
			if (items.length > 0) {
				groups.set(cat, items);
			}
		}
		return groups;
	}, [variables]);

	// -----------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------

	function handleLevelChange(value: string) {
		if (value) {
			setLevel(Number(value));
		}
	}

	function handleZoneChange(value: string) {
		setZone(value ? Number(value) : null);
	}

	function handleVariableToggle(variableId: number) {
		toggleVariable(variableId);
	}

	function handleVariableClick(variableId: number) {
		if (variableIds.includes(variableId)) {
			setActiveVariable(variableId);
		}
	}

	// -----------------------------------------------------------
	// Render
	// -----------------------------------------------------------

	return (
		<aside
			className="flex h-full flex-col border-r border-border bg-card"
			aria-label="Controls Panel"
		>
			<ScrollArea className="h-full">
				<div className="flex flex-col gap-4 p-4">
					{/* Level Toggle Group */}
					<div className="space-y-1.5">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Level
						</Label>
						<ToggleGroup
							type="single"
							value={levelId?.toString() ?? ""}
							onValueChange={(value) => {
								if (value) handleLevelChange(value);
							}}
							variant="outline"
							size="sm"
							className="w-full"
						>
							{levels.map((l) => (
								<ToggleGroupItem
									key={l.levelId}
									value={l.levelId.toString()}
									aria-label={`Select ${l.level} level`}
									className="flex-1 capitalize"
								>
									{l.level}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<Separator />

					{/* Zone Filter/Search */}
					<div className="space-y-1.5">
						<Label htmlFor="zone-search" className="text-xs uppercase tracking-wide text-muted-foreground">
							Zone
						</Label>
						<Input
							id="zone-search"
							type="search"
							placeholder="Search zones…"
							value={zoneSearch}
							onChange={(e) => setZoneSearch(e.target.value)}
							aria-label="Search zones by name or city"
						/>
						<Select
							value={zoneId?.toString() ?? ""}
							onValueChange={handleZoneChange}
							disabled={levelId === null}
						>
							<SelectTrigger id="zone-select" className="w-full" aria-label="Select zone">
								<SelectValue placeholder={levelId === null ? "Select a level first" : "All zones"} />
							</SelectTrigger>
							<SelectContent>
								{filteredZones.map((z) => (
									<SelectItem key={z.zoneId} value={z.zoneId.toString()}>
										{z.name} — {z.city}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<Separator />

					{/* Variable Selection */}
					<div className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Layer
						</Label>
						{isLayerLoading && (
							<div className="flex items-center gap-2 py-2">
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
								<span className="text-xs text-muted-foreground">Loading layer…</span>
							</div>
						)}
						<div className="flex flex-col gap-2">
							{CATEGORY_ORDER.map((category) => {
								const items = groupedVariables.get(category);
								if (!items) return null;

								return (
									<Card key={category} size="sm" className="bg-muted/30">
										<CardHeader className="pb-1">
											<CardTitle className="text-xs font-medium text-muted-foreground">
												{CATEGORY_LABELS[category]}
											</CardTitle>
										</CardHeader>
										<CardContent className="flex flex-col gap-1">
											{items.map((variable) => {
												const isActive = activeVariableId === variable.variableId;

												return (
													<div
														key={variable.variableId}
														className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
															isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
														}`}
													>
														<button
															type="button"
															onClick={() => {
																// Ensure variable is toggled on and set as active
																if (!variableIds.includes(variable.variableId)) {
																	handleVariableToggle(variable.variableId);
																}
																handleVariableClick(variable.variableId);
															}}
															className={`flex-1 cursor-pointer text-left text-sm select-none ${
																isActive
																	? "font-semibold text-foreground"
																	: "text-muted-foreground"
															}`}
															aria-pressed={isActive}
															aria-label={`Select ${variable.name} layer`}
														>
															{variable.name}
														</button>

														{/* Info button → opens modal with description */}
														<Dialog>
															<DialogTrigger asChild>
																<button
																	type="button"
																	className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
																	aria-label={`Info about ${variable.name}`}
																>
																	<Info className="h-3.5 w-3.5" />
																</button>
															</DialogTrigger>
															<DialogContent>
																<DialogHeader>
																	<DialogTitle>{variable.name}</DialogTitle>
																	<DialogDescription className="text-xs text-muted-foreground">
																		{variable.key.toUpperCase()} · {CATEGORY_LABELS[variable.category]}
																	</DialogDescription>
																</DialogHeader>
																<p className="text-sm leading-relaxed text-foreground/90">
																	{variable.description}
																</p>
															</DialogContent>
														</Dialog>
													</div>
												);
											})}
										</CardContent>
									</Card>
								);
							})}
						</div>
					</div>
				</div>
			</ScrollArea>
		</aside>
	);
});
