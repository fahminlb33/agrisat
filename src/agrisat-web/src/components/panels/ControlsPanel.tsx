import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useStore } from "zustand";
import type {
	ComparisonMode,
	ComparisonTarget,
} from "#/stores/query-context";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
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
import { Switch } from "#/components/ui/switch";
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

type TimeRangePreset = "7d" | "30d" | "90d" | "custom";

const TIME_RANGE_PRESETS: { key: TimeRangePreset; label: string; days: number | null }[] = [
	{ key: "7d", label: "7d", days: 7 },
	{ key: "30d", label: "30d", days: 30 },
	{ key: "90d", label: "90d", days: 90 },
	{ key: "custom", label: "Custom", days: null },
];

const COMPARISON_TYPES: { key: ComparisonMode["type"]; label: string }[] = [
	{ key: "zone", label: "Zone vs Zone" },
	{ key: "time", label: "Time vs Time" },
	{ key: "variable", label: "Variable vs Variable" },
];

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export default function ControlsPanel({
	levels,
	zones,
	variables,
	store,
}: ControlsPanelProps) {
	const levelId = useStore(store, (s) => s.levelId);
	const zoneId = useStore(store, (s) => s.zoneId);
	const variableIds = useStore(store, (s) => s.variableIds);
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	const timeRange = useStore(store, (s) => s.timeRange);
	const comparisonMode = useStore(store, (s) => s.comparisonMode);
	const setLevel = useStore(store, (s) => s.setLevel);
	const setZone = useStore(store, (s) => s.setZone);
	const toggleVariable = useStore(store, (s) => s.toggleVariable);
	const setActiveVariable = useStore(store, (s) => s.setActiveVariable);
	const setTimeRange = useStore(store, (s) => s.setTimeRange);
	const enableComparison = useStore(store, (s) => s.enableComparison);
	const disableComparison = useStore(store, (s) => s.disableComparison);

	const [zoneSearch, setZoneSearch] = useState("");
	const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>("30d");
	const [customStartDate, setCustomStartDate] = useState(
		dayjs(timeRange.startTs).format("YYYY-MM-DD"),
	);
	const [customEndDate, setCustomEndDate] = useState(
		dayjs(timeRange.endTs).format("YYYY-MM-DD"),
	);
	const [comparisonEnabled, setComparisonEnabled] = useState(comparisonMode !== null);
	const [comparisonType, setComparisonType] = useState<ComparisonMode["type"]>("zone");
	const [targetA, setTargetA] = useState<ComparisonTarget>({});
	const [targetB, setTargetB] = useState<ComparisonTarget>({});
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

	function handleTimeRangePreset(preset: TimeRangePreset) {
		setTimeRangePreset(preset);
		const presetConfig = TIME_RANGE_PRESETS.find((p) => p.key === preset);
		if (presetConfig?.days) {
			const endTs = dayjs().startOf("day").toDate();
			const startTs = dayjs().subtract(presetConfig.days, "day").startOf("day").toDate();
			setTimeRange(startTs, endTs);
			setCustomStartDate(dayjs(startTs).format("YYYY-MM-DD"));
			setCustomEndDate(dayjs(endTs).format("YYYY-MM-DD"));
		}
	}

	function handleCustomDateChange(type: "start" | "end", value: string) {
		if (type === "start") {
			setCustomStartDate(value);
			const startTs = dayjs(value).startOf("day").toDate();
			const endTs = dayjs(customEndDate).startOf("day").toDate();
			if (startTs.getTime() < endTs.getTime()) {
				setTimeRange(startTs, endTs);
			}
		} else {
			setCustomEndDate(value);
			const startTs = dayjs(customStartDate).startOf("day").toDate();
			const endTs = dayjs(value).startOf("day").toDate();
			if (startTs.getTime() < endTs.getTime()) {
				setTimeRange(startTs, endTs);
			}
		}
	}

	function handleComparisonToggle(checked: boolean) {
		if (!checked) {
			setComparisonEnabled(false);
			disableComparison();
		} else {
			setComparisonEnabled(true);
		}
	}

	function handleComparisonTypeChange(type: string) {
		setComparisonType(type as ComparisonMode["type"]);
		setTargetA({});
		setTargetB({});
		disableComparison();
	}

	function handleTargetChange(target: "A" | "B", value: string) {
		let newTargetA = targetA;
		let newTargetB = targetB;

		if (comparisonType === "zone") {
			const zoneIdVal = value ? Number(value) : undefined;
			if (target === "A") {
				newTargetA = { zoneId: zoneIdVal };
				setTargetA(newTargetA);
			} else {
				newTargetB = { zoneId: zoneIdVal };
				setTargetB(newTargetB);
			}
		} else if (comparisonType === "variable") {
			const variableIdVal = value ? Number(value) : undefined;
			if (target === "A") {
				newTargetA = { variableId: variableIdVal };
				setTargetA(newTargetA);
			} else {
				newTargetB = { variableId: variableIdVal };
				setTargetB(newTargetB);
			}
		}

		if (comparisonType === "zone") {
			const aZone = target === "A" ? newTargetA.zoneId : targetA.zoneId;
			const bZone = target === "B" ? newTargetB.zoneId : targetB.zoneId;
			if (aZone !== undefined && bZone !== undefined) {
				enableComparison({ type: "zone", targetA: newTargetA, targetB: newTargetB });
			}
		} else if (comparisonType === "variable") {
			const aVar = target === "A" ? newTargetA.variableId : targetA.variableId;
			const bVar = target === "B" ? newTargetB.variableId : targetB.variableId;
			if (aVar !== undefined && bVar !== undefined) {
				enableComparison({ type: "variable", targetA: newTargetA, targetB: newTargetB });
			}
		}
	}

	function handleTimeTargetChange(target: "A" | "B", field: "start" | "end", value: string) {
		const date = dayjs(value).startOf("day").toDate();
		let newTargetA = { ...targetA };
		let newTargetB = { ...targetB };

		if (target === "A") {
			const existing = targetA.timeRange ?? { startTs: timeRange.startTs, endTs: timeRange.endTs };
			newTargetA = {
				timeRange: {
					startTs: field === "start" ? date : existing.startTs,
					endTs: field === "end" ? date : existing.endTs,
				},
			};
			setTargetA(newTargetA);
		} else {
			const existing = targetB.timeRange ?? { startTs: timeRange.startTs, endTs: timeRange.endTs };
			newTargetB = {
				timeRange: {
					startTs: field === "start" ? date : existing.startTs,
					endTs: field === "end" ? date : existing.endTs,
				},
			};
			setTargetB(newTargetB);
		}

		const aRange = target === "A" ? newTargetA.timeRange : targetA.timeRange;
		const bRange = target === "B" ? newTargetB.timeRange : targetB.timeRange;
		if (aRange && bRange && aRange.startTs < aRange.endTs && bRange.startTs < bRange.endTs) {
			enableComparison({ type: "time", targetA: newTargetA, targetB: newTargetB });
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
					{/* Level Selector */}
					<div className="space-y-1.5">
						<Label htmlFor="level-select" className="text-xs uppercase tracking-wide text-muted-foreground">
							Level
						</Label>
						<Select
							value={levelId?.toString() ?? ""}
							onValueChange={handleLevelChange}
						>
							<SelectTrigger id="level-select" className="w-full" aria-label="Select level">
								<SelectValue placeholder="Select a level…" />
							</SelectTrigger>
							<SelectContent>
								{levels.map((l) => (
									<SelectItem key={l.levelId} value={l.levelId.toString()}>
										{l.level}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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

					{/* Variable Toggles */}
					<div className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Variables
						</Label>
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
												const isToggled = variableIds.includes(variable.variableId);
												const isActive = activeVariableId === variable.variableId;
												const isLastVariable = isToggled && variableIds.length === 1;

												return (
													<div
														key={variable.variableId}
														className={`flex items-center gap-2 rounded-md px-2 py-1 ${
															isActive ? "bg-accent" : ""
														}`}
													>
														<Checkbox
															id={`var-${variable.variableId}`}
															checked={isToggled}
															onCheckedChange={() => handleVariableToggle(variable.variableId)}
															disabled={isLastVariable}
															aria-label={`Toggle ${variable.name}`}
															title={
																isLastVariable
																	? "At least one variable must remain selected"
																	: undefined
															}
														/>
														<button
															type="button"
															onClick={() => handleVariableClick(variable.variableId)}
															className={`flex-1 text-left text-sm ${
																isActive
																	? "font-semibold text-foreground"
																	: "text-muted-foreground"
															} ${!isToggled ? "opacity-50" : ""}`}
															disabled={!isToggled}
															aria-label={`Set ${variable.name} as active variable`}
															aria-pressed={isActive}
															title={variable.description}
														>
															<span className="block leading-tight">
																{variable.name}
															</span>
															<span className="block text-xs opacity-70">
																{variable.key}
															</span>
														</button>
													</div>
												);
											})}
										</CardContent>
									</Card>
								);
							})}
						</div>
					</div>

					<Separator />

					{/* Time Range Picker */}
					<div className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Time Range
						</Label>
						<ToggleGroup
							type="single"
							value={timeRangePreset}
							onValueChange={(value) => {
								if (value) handleTimeRangePreset(value as TimeRangePreset);
							}}
							variant="outline"
							size="sm"
							className="w-full"
						>
							{TIME_RANGE_PRESETS.map((preset) => (
								<ToggleGroupItem
									key={preset.key}
									value={preset.key}
									aria-label={`Set time range to ${preset.label}`}
									className="flex-1"
								>
									{preset.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>

						{timeRangePreset === "custom" && (
							<div className="flex flex-col gap-2">
								<div className="space-y-1">
									<Label htmlFor="custom-start-date" className="text-xs text-muted-foreground">
										Start
									</Label>
									<Input
										id="custom-start-date"
										type="date"
										value={customStartDate}
										onChange={(e) => handleCustomDateChange("start", e.target.value)}
										aria-label="Custom start date"
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="custom-end-date" className="text-xs text-muted-foreground">
										End
									</Label>
									<Input
										id="custom-end-date"
										type="date"
										value={customEndDate}
										onChange={(e) => handleCustomDateChange("end", e.target.value)}
										aria-label="Custom end date"
									/>
								</div>
							</div>
						)}
						<p className="text-xs text-muted-foreground">
							{dayjs(timeRange.startTs).format("MMM D, YYYY")} — {dayjs(timeRange.endTs).format("MMM D, YYYY")}
						</p>
					</div>

					<Separator />

					{/* Comparison Mode */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="comparison-toggle" className="text-xs uppercase tracking-wide text-muted-foreground">
								Comparison
							</Label>
							<Switch
								id="comparison-toggle"
								checked={comparisonEnabled}
								onCheckedChange={handleComparisonToggle}
								aria-label="Toggle comparison mode"
								size="sm"
							/>
						</div>

						{comparisonEnabled && (
							<div className="flex flex-col gap-3">
								{/* Comparison Type Selection */}
								<div className="space-y-1">
									<Label htmlFor="comparison-type" className="text-xs text-muted-foreground">
										Compare by
									</Label>
									<Select
										value={comparisonType}
										onValueChange={handleComparisonTypeChange}
									>
										<SelectTrigger id="comparison-type" className="w-full" aria-label="Select comparison type">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{COMPARISON_TYPES.map((ct) => (
												<SelectItem key={ct.key} value={ct.key}>
													{ct.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Target Selection: Zone vs Zone */}
								{comparisonType === "zone" && (
									<div className="flex flex-col gap-2">
										<div className="space-y-1">
											<Label htmlFor="compare-zone-a" className="text-xs text-muted-foreground">
												Zone A
											</Label>
											<Select
												value={targetA.zoneId?.toString() ?? ""}
												onValueChange={(v) => handleTargetChange("A", v)}
											>
												<SelectTrigger id="compare-zone-a" className="w-full" aria-label="Select zone A for comparison">
													<SelectValue placeholder="Select zone…" />
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
										<div className="space-y-1">
											<Label htmlFor="compare-zone-b" className="text-xs text-muted-foreground">
												Zone B
											</Label>
											<Select
												value={targetB.zoneId?.toString() ?? ""}
												onValueChange={(v) => handleTargetChange("B", v)}
											>
												<SelectTrigger id="compare-zone-b" className="w-full" aria-label="Select zone B for comparison">
													<SelectValue placeholder="Select zone…" />
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
									</div>
								)}

								{/* Target Selection: Time vs Time */}
								{comparisonType === "time" && (
									<div className="flex flex-col gap-3">
										<Card size="sm" className="bg-muted/30">
											<CardHeader className="pb-1">
												<CardTitle className="text-xs font-medium text-muted-foreground">
													Period A
												</CardTitle>
											</CardHeader>
											<CardContent className="flex flex-col gap-1">
												<Input
													type="date"
													value={targetA.timeRange ? dayjs(targetA.timeRange.startTs).format("YYYY-MM-DD") : ""}
													onChange={(e) => handleTimeTargetChange("A", "start", e.target.value)}
													aria-label="Period A start date"
												/>
												<Input
													type="date"
													value={targetA.timeRange ? dayjs(targetA.timeRange.endTs).format("YYYY-MM-DD") : ""}
													onChange={(e) => handleTimeTargetChange("A", "end", e.target.value)}
													aria-label="Period A end date"
												/>
											</CardContent>
										</Card>
										<Card size="sm" className="bg-muted/30">
											<CardHeader className="pb-1">
												<CardTitle className="text-xs font-medium text-muted-foreground">
													Period B
												</CardTitle>
											</CardHeader>
											<CardContent className="flex flex-col gap-1">
												<Input
													type="date"
													value={targetB.timeRange ? dayjs(targetB.timeRange.startTs).format("YYYY-MM-DD") : ""}
													onChange={(e) => handleTimeTargetChange("B", "start", e.target.value)}
													aria-label="Period B start date"
												/>
												<Input
													type="date"
													value={targetB.timeRange ? dayjs(targetB.timeRange.endTs).format("YYYY-MM-DD") : ""}
													onChange={(e) => handleTimeTargetChange("B", "end", e.target.value)}
													aria-label="Period B end date"
												/>
											</CardContent>
										</Card>
									</div>
								)}

								{/* Target Selection: Variable vs Variable */}
								{comparisonType === "variable" && (
									<div className="flex flex-col gap-2">
										<div className="space-y-1">
											<Label htmlFor="compare-var-a" className="text-xs text-muted-foreground">
												Variable A
											</Label>
											<Select
												value={targetA.variableId?.toString() ?? ""}
												onValueChange={(v) => handleTargetChange("A", v)}
											>
												<SelectTrigger id="compare-var-a" className="w-full" aria-label="Select variable A for comparison">
													<SelectValue placeholder="Select variable…" />
												</SelectTrigger>
												<SelectContent>
													{variables.map((v) => (
														<SelectItem key={v.variableId} value={v.variableId.toString()}>
															{v.name} ({v.key})
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1">
											<Label htmlFor="compare-var-b" className="text-xs text-muted-foreground">
												Variable B
											</Label>
											<Select
												value={targetB.variableId?.toString() ?? ""}
												onValueChange={(v) => handleTargetChange("B", v)}
											>
												<SelectTrigger id="compare-var-b" className="w-full" aria-label="Select variable B for comparison">
													<SelectValue placeholder="Select variable…" />
												</SelectTrigger>
												<SelectContent>
													{variables.map((v) => (
														<SelectItem key={v.variableId} value={v.variableId.toString()}>
															{v.name} ({v.key})
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</ScrollArea>
		</aside>
	);
}
