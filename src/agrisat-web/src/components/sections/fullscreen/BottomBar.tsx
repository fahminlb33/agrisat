import { memo, useEffect, useMemo, useRef } from "react";
import { Cloud, Layers } from "lucide-react";
import dayjs from "dayjs";

import type { Zone as ApiZone, Level as ApiLevel, Variable } from "#/services/api";
import { useEnvironmentalData } from "#/hooks/useEnvironmentalData";
import { useWeatherData } from "#/hooks/useWeatherData";
import { LayerTimeline } from "./LayerTimeline";
import { useControls, useQueryContext } from "./ControlProvider";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Separator } from "#/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";

import { getVariableKey } from "#/lib/variables";

interface BottomBarProps {
	levels: ApiLevel[];
	zones: ApiZone[];
	variables: Variable[];
}

/**
 * BottomBar fetches its own environmental + weather data from the query context.
 * Completely self-contained — the parent only passes static reference data.
 */
export const BottomBar = memo(function BottomBar({
	levels,
	zones,
	variables,
}: BottomBarProps) {
	// Query context subscriptions (granular)
	const zoneId = useQueryContext((s) => s.zoneId);
	const levelId = useQueryContext((s) => s.levelId);
	const timeRange = useQueryContext((s) => s.timeRange);
	const activeVariableId = useQueryContext((s) => s.activeVariableId);
	const toggleVariable = useQueryContext((s) => s.toggleVariable);
	const setActiveVariable = useQueryContext((s) => s.setActiveVariable);

	// UI controls
	const openSearch = useControls((s) => s.openSearch);
	const selectedDate = useControls((s) => s.selectedDate);
	const setSelectedDate = useControls((s) => s.setSelectedDate);
	const datePickerOpen = useControls((s) => s.datePickerOpen);
	const toggleDatePicker = useControls((s) => s.toggleDatePicker);

	// Own data fetches
	const { data: envData = [] } = useEnvironmentalData({
		zoneId,
		levelId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const { data: weatherData = [] } = useWeatherData({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const latestWeather = weatherData.length > 0 ? weatherData[weatherData.length - 1] : null;

	// Available timestamps from env data — stabilized to avoid new array reference
	// each render when the underlying dates haven't actually changed.
	const availableTimestampsRaw = useMemo(() => {
		const dateSet = new Set<string>();
		for (const d of envData) {
			dateSet.add(dayjs(d.timestamp).format("YYYY-MM-DD"));
		}
		return Array.from(dateSet)
			.sort()
			.map((s) => dayjs(s).toDate());
	}, [envData]);

	const availableTimestampsRef = useRef<Date[]>([]);
	const prevKeyRef = useRef<string>("");
	const newKey = availableTimestampsRaw.map((d) => d.getTime()).join(",");
	if (newKey !== prevKeyRef.current) {
		prevKeyRef.current = newKey;
		availableTimestampsRef.current = availableTimestampsRaw;
	}
	const availableTimestamps = availableTimestampsRef.current;

	// Default to latest date when timestamps first become available.
	// Resets when zone changes (new zone = new data = re-initialize date).
	const dateInitializedRef = useRef(false);
	const prevZoneIdRef = useRef(zoneId);
	if (prevZoneIdRef.current !== zoneId) {
		prevZoneIdRef.current = zoneId;
		dateInitializedRef.current = false;
	}
	useEffect(() => {
		if (availableTimestamps.length === 0) {
			dateInitializedRef.current = false;
			return;
		}
		if (dateInitializedRef.current) return;
		dateInitializedRef.current = true;
		setSelectedDate(availableTimestamps[availableTimestamps.length - 1]);
	}, [availableTimestamps, setSelectedDate]);

	// Current zone
	const currentZone = useMemo(() => {
		if (!zoneId) return null;
		return zones.find((z) => z.zone_id === zoneId) ?? null;
	}, [zoneId, zones]);

	// Active variable key
	const activeVarKey = activeVariableId ? getVariableKey(activeVariableId) : "ndvi";

	const handleSelectVariable = (varId: number) => {
		toggleVariable(varId);
		setActiveVariable(varId);
	};

	const handleSelectDate = (date: Date) => {
		setSelectedDate(date);
	};

	return (
		<div className="absolute bottom-5 left-1/2 z-20 w-full max-w-xl sm:max-w-3xl -translate-x-1/2 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
			<div className="flex items-center gap-1 rounded-xl bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200">

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={openSearch}
							className="shrink-0 gap-1.5 px-2"
						>
							{currentZone ? (
								<>
									<Badge
										variant="outline"
										className="border-emerald-200 bg-emerald-50 text-emerald-700 capitalize dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
									>
										{levels.find((l) => l.level_id === currentZone.level_id)?.level ?? ""}
									</Badge>
									<span className="hidden sm:inline text-xs font-medium text-foreground">
										{currentZone.name}
									</span>
								</>
							) : (
								<>
									<Layers className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="hidden sm:inline text-xs text-muted-foreground">Select zone</span>
								</>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">Search zones</TooltipContent>
				</Tooltip>

				<Separator orientation="vertical" className="mx-0.5 h-4" />

				{availableTimestamps.length > 0 ? (
					<LayerTimeline
						timestamps={availableTimestamps}
						selectedDate={selectedDate}
						onSelectDate={handleSelectDate}
						variableKey={activeVarKey}
						variables={variables}
						activeVariableId={activeVariableId}
						onSelectVariable={handleSelectVariable}
						datePickerOpen={datePickerOpen}
						onToggleDatePicker={toggleDatePicker}
					/>
				) : (
					<span className="flex-1 text-center text-xs text-muted-foreground">No layer data</span>
				)}

				<Separator orientation="vertical" className="hidden sm:block mx-0.5 h-4" />

				{latestWeather && (
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="hidden sm:flex shrink-0 cursor-default items-center gap-1 px-1">
								<Cloud className="h-3 w-3 text-muted-foreground" />
								<span className="text-[10px] text-muted-foreground">
									{latestWeather.cloud_cover_pct}%
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="top">Cloud cover</TooltipContent>
					</Tooltip>
				)}

				{currentZone && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="hidden sm:inline shrink-0 cursor-default px-1 text-[10px] text-muted-foreground">
								{(currentZone.area / 1_000_000).toFixed(1)} km²
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">Zone area</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
});
