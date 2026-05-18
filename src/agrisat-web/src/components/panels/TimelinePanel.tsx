import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useStore } from "zustand";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { DualRangeSlider } from "#/components/ui/range-slider";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

import type { EnvironmentalTimePoint, WeatherTimePoint } from "#/types/api";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface TimelinePanelProps {
	store: ReturnType<typeof import("#/stores/query-context").createQueryContextStore>;
	/** Available timestamps for the selected zone/level, sorted ascending */
	availableTimestamps: Date[];
	/** Time series data for the active variable (used for trend preview) */
	trendData: Array<{ ts: Date; value: number }>;
	/** Name/key of the active variable for display */
	activeVariableKey: string | null;
	/** Full environmental time series for charting */
	environmentalData?: EnvironmentalTimePoint[];
	/** Full weather time series for charting */
	weatherData?: WeatherTimePoint[];
	/** Callback when a single date is selected (for raster layer) */
	onDateSelect?: (date: Date) => void;
	/** Currently selected single date (for raster) */
	selectedDate?: Date | null;
}

// -----------------------------------------------------------
// Constants
// -----------------------------------------------------------

type TimeRangePreset = "7d" | "30d" | "90d" | "all";

const TIME_RANGE_PRESETS: { key: TimeRangePreset; label: string; days: number | null }[] = [
	{ key: "7d", label: "7d", days: 7 },
	{ key: "30d", label: "30d", days: 30 },
	{ key: "90d", label: "90d", days: 90 },
	{ key: "all", label: "All", days: null },
];

type ChartView = "env" | "weather" | "combined";

const ENV_VARIABLE_COLORS: Record<string, string> = {
	ndvi: "hsl(142, 71%, 45%)",
	gndvi: "hsl(160, 60%, 45%)",
	wdrvi: "hsl(80, 60%, 45%)",
	msavi: "hsl(100, 50%, 50%)",
	ndre: "hsl(30, 80%, 50%)",
	cire: "hsl(50, 70%, 45%)",
	ndmi: "hsl(200, 70%, 50%)",
	ndwi: "hsl(220, 70%, 55%)",
};

const VARIABLE_LABELS: Record<string, string> = {
	ndvi: "NDVI",
	gndvi: "GNDVI",
	wdrvi: "WDRVI",
	msavi: "MSAVI",
	ndre: "NDRE",
	cire: "CIre",
	ndmi: "NDMI",
	ndwi: "NDWI",
};

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export default function TimelinePanel({
	store,
	availableTimestamps,
	trendData,
	activeVariableKey,
	environmentalData = [],
	weatherData = [],
	onDateSelect,
	selectedDate,
}: TimelinePanelProps) {
	const timeRange = useStore(store, (s) => s.timeRange);
	const setTimeRange = useStore(store, (s) => s.setTimeRange);

	const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>("90d");
	const [chartView, setChartView] = useState<ChartView>("env");
	const [isExpanded, setIsExpanded] = useState(false);

	// -----------------------------------------------------------
	// Derived state
	// -----------------------------------------------------------

	const sortedTimestamps = useMemo(
		() => [...availableTimestamps].sort((a, b) => a.getTime() - b.getTime()),
		[availableTimestamps],
	);

	// Map time range to slider indices
	const rangeIndices = useMemo(() => {
		if (sortedTimestamps.length === 0) return [0, 0];

		let startIdx = 0;
		let endIdx = sortedTimestamps.length - 1;

		for (let i = 0; i < sortedTimestamps.length; i++) {
			if (sortedTimestamps[i].getTime() >= timeRange.startTs.getTime()) {
				startIdx = i;
				break;
			}
		}

		for (let i = sortedTimestamps.length - 1; i >= 0; i--) {
			if (sortedTimestamps[i].getTime() <= timeRange.endTs.getTime()) {
				endIdx = i;
				break;
			}
		}

		return [startIdx, endIdx];
	}, [sortedTimestamps, timeRange]);

	// Compute trend stats
	const trendStats = useMemo(() => {
		if (trendData.length < 2) return null;
		const values = trendData.map((d) => d.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const avg = values.reduce((a, b) => a + b, 0) / values.length;
		const latest = values[values.length - 1];
		const first = values[0];
		const change = latest - first;
		const changePct = first !== 0 ? (change / first) * 100 : 0;
		return { min, max, avg, latest, change, changePct };
	}, [trendData]);

	// Environmental chart data
	const envChartData = useMemo(() => {
		return environmentalData.map((d) => ({
			date: dayjs(d.timestamp).format("MMM D"),
			dateRaw: d.timestamp,
			ndvi: d.ndvi,
			gndvi: d.gndvi,
			wdrvi: d.wdrvi,
			msavi: d.msavi,
			ndre: d.ndre,
			cire: d.cire,
			ndmi: d.ndmi,
			ndwi: d.ndwi,
		}));
	}, [environmentalData]);

	// Weather chart data
	const weatherChartData = useMemo(() => {
		return weatherData.map((d) => {
			const tempRaw = d.temperature;
			const tempC = tempRaw > 100 ? tempRaw - 273.15 : tempRaw;
			return {
				date: dayjs(d.timestamp).format("MMM D HH:mm"),
				dateShort: dayjs(d.timestamp).format("MMM D"),
				dateRaw: d.timestamp,
				temperature: Number(tempC.toFixed(1)),
				precipitation: d.precipitation,
				cloudCover: d.cloud_cover_pct,
				isRaining: d.is_raining,
			};
		});
	}, [weatherData]);

	// Selected date index for the date picker dots
	const selectedDateIdx = useMemo(() => {
		if (!selectedDate || sortedTimestamps.length === 0) return null;
		const target = dayjs(selectedDate).startOf("day").valueOf();
		for (let i = 0; i < sortedTimestamps.length; i++) {
			if (dayjs(sortedTimestamps[i]).startOf("day").valueOf() === target) return i;
		}
		return null;
	}, [selectedDate, sortedTimestamps]);

	// -----------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------

	const handleRangeChange = useCallback(
		(values: number[]) => {
			const [startIdx, endIdx] = values;
			if (
				startIdx >= 0 &&
				endIdx < sortedTimestamps.length &&
				startIdx < endIdx
			) {
				const newStart = sortedTimestamps[startIdx];
				const newEnd = sortedTimestamps[endIdx];
				if (newStart.getTime() < newEnd.getTime()) {
					setTimeRange(newStart, newEnd);
				}
			}
		},
		[sortedTimestamps, setTimeRange],
	);

	const handlePresetChange = useCallback(
		(preset: TimeRangePreset) => {
			setTimeRangePreset(preset);
			const config = TIME_RANGE_PRESETS.find((p) => p.key === preset);
			if (config?.days) {
				const endTs = dayjs().startOf("day").toDate();
				const startTs = dayjs().subtract(config.days, "day").startOf("day").toDate();
				setTimeRange(startTs, endTs);
			} else if (preset === "all" && sortedTimestamps.length >= 2) {
				setTimeRange(sortedTimestamps[0], sortedTimestamps[sortedTimestamps.length - 1]);
			}
		},
		[setTimeRange, sortedTimestamps],
	);

	const handleDateClick = useCallback(
		(idx: number) => {
			if (idx >= 0 && idx < sortedTimestamps.length && onDateSelect) {
				onDateSelect(sortedTimestamps[idx]);
			}
		},
		[sortedTimestamps, onDateSelect],
	);

	const handleStepDate = useCallback(
		(direction: -1 | 1) => {
			if (!selectedDate || sortedTimestamps.length === 0) return;
			const currentIdx = selectedDateIdx ?? 0;
			const newIdx = Math.max(0, Math.min(sortedTimestamps.length - 1, currentIdx + direction));
			if (onDateSelect) {
				onDateSelect(sortedTimestamps[newIdx]);
			}
		},
		[selectedDate, selectedDateIdx, sortedTimestamps, onDateSelect],
	);

	// -----------------------------------------------------------
	// Empty state
	// -----------------------------------------------------------

	if (sortedTimestamps.length === 0) {
		return (
			<section
				className="flex items-center justify-center border-t border-border bg-card px-4 py-4"
				aria-label="Timeline Panel"
			>
				<p className="text-sm text-muted-foreground">
					No observations available for the current selection.
				</p>
			</section>
		);
	}

	// -----------------------------------------------------------
	// Render
	// -----------------------------------------------------------

	const sliderMax = Math.max(sortedTimestamps.length - 1, 1);

	return (
		<section
			className="flex flex-col border-t border-border bg-card"
			aria-label="Timeline Panel"
		>
			{/* Header row */}
			<div className="flex items-center justify-between px-4 pt-3 pb-2">
				<div className="flex items-center gap-3">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Timeline
					</h3>
					{activeVariableKey && (
						<span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
							{activeVariableKey.toUpperCase()}
						</span>
					)}
					{/* Date stepper for raster single-date selection */}
					{onDateSelect && sortedTimestamps.length > 0 && (
						<div className="flex items-center gap-1 rounded-md border border-border px-1">
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5"
								onClick={() => handleStepDate(-1)}
								disabled={selectedDateIdx === 0 || selectedDateIdx === null}
								aria-label="Previous date"
							>
								<ChevronLeft className="h-3 w-3" />
							</Button>
							<span className="flex items-center gap-1 px-1 text-[10px] font-medium text-foreground">
								<Calendar className="h-3 w-3 text-muted-foreground" />
								{selectedDate ? dayjs(selectedDate).format("MMM D, YYYY") : "Select date"}
							</span>
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5"
								onClick={() => handleStepDate(1)}
								disabled={selectedDateIdx === sortedTimestamps.length - 1 || selectedDateIdx === null}
								aria-label="Next date"
							>
								<ChevronRight className="h-3 w-3" />
							</Button>
						</div>
					)}
				</div>
				<div className="flex items-center gap-3">
					{/* Chart view toggle */}
					{(environmentalData.length > 0 || weatherData.length > 0) && (
						<ToggleGroup
							type="single"
							value={chartView}
							onValueChange={(v) => { if (v) setChartView(v as ChartView); }}
							variant="outline"
							size="sm"
						>
							<ToggleGroupItem value="env" className="h-6 px-2 text-[10px]" aria-label="Environmental chart">
								Env
							</ToggleGroupItem>
							<ToggleGroupItem value="weather" className="h-6 px-2 text-[10px]" aria-label="Weather chart">
								Weather
							</ToggleGroupItem>
							<ToggleGroupItem value="combined" className="h-6 px-2 text-[10px]" aria-label="Combined chart">
								Both
							</ToggleGroupItem>
						</ToggleGroup>
					)}
					{/* Time range presets */}
					<ToggleGroup
						type="single"
						value={timeRangePreset}
						onValueChange={(value) => {
							if (value) handlePresetChange(value as TimeRangePreset);
						}}
						variant="outline"
						size="sm"
					>
						{TIME_RANGE_PRESETS.map((preset) => (
							<ToggleGroupItem
								key={preset.key}
								value={preset.key}
								className="h-6 px-2 text-[10px]"
								aria-label={`Set time range to ${preset.label}`}
							>
								{preset.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<span className="text-[11px] font-medium text-foreground">
						{dayjs(timeRange.startTs).format("MMM D")} — {dayjs(timeRange.endTs).format("MMM D, YYYY")}
					</span>
					{/* Expand/collapse charts */}
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={() => setIsExpanded(!isExpanded)}
					>
						{isExpanded ? "Collapse" : "Expand"}
					</Button>
				</div>
			</div>

			{/* Interactive date dots / history timeline */}
			{sortedTimestamps.length > 1 && (
				<div className="relative mx-4 mb-1">
					{/* Date dots row */}
					<div className="flex items-center justify-between">
						{sortedTimestamps.length <= 60 ? (
							// Show individual dots when there are few timestamps
							sortedTimestamps.map((ts, idx) => {
								const isSelected = selectedDateIdx === idx;
								const isInRange =
									ts.getTime() >= timeRange.startTs.getTime() &&
									ts.getTime() <= timeRange.endTs.getTime();
								return (
									<button
										key={ts.getTime()}
										type="button"
										onClick={() => handleDateClick(idx)}
										className={cn(
											"h-2 w-2 rounded-full transition-all cursor-pointer hover:scale-150",
											isSelected
												? "bg-primary ring-2 ring-primary/30 scale-150"
												: isInRange
													? "bg-primary/60"
													: "bg-muted-foreground/30",
										)}
										aria-label={`Select ${dayjs(ts).format("MMM D, YYYY")}`}
										title={dayjs(ts).format("MMM D, YYYY")}
									/>
								);
							})
						) : (
							// Condensed view for many timestamps
							<div className="flex h-3 w-full items-end gap-px">
								{sortedTimestamps.map((ts, idx) => {
									const isSelected = selectedDateIdx === idx;
									const isInRange =
										ts.getTime() >= timeRange.startTs.getTime() &&
										ts.getTime() <= timeRange.endTs.getTime();
									return (
										<button
											key={ts.getTime()}
											type="button"
											onClick={() => handleDateClick(idx)}
											className={cn(
												"flex-1 min-w-[1px] cursor-pointer transition-all",
												isSelected
													? "bg-primary h-3"
													: isInRange
														? "bg-primary/50 h-2"
														: "bg-muted-foreground/20 h-1",
											)}
											aria-label={`Select ${dayjs(ts).format("MMM D, YYYY")}`}
											title={dayjs(ts).format("MMM D, YYYY")}
										/>
									);
								})}
							</div>
						)}
					</div>
					{/* Date labels */}
					<div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
						<span>{dayjs(sortedTimestamps[0]).format("MMM D, YYYY")}</span>
						<span>{dayjs(sortedTimestamps[sortedTimestamps.length - 1]).format("MMM D, YYYY")}</span>
					</div>
				</div>
			)}

			{/* Dual range slider */}
			{sortedTimestamps.length > 1 && (
				<div className="px-5 pb-2">
					<DualRangeSlider
						min={0}
						max={sliderMax}
						step={1}
						minStepsBetweenThumbs={1}
						value={rangeIndices}
						onValueChange={handleRangeChange}
						aria-label="Time range selection"
					/>
				</div>
			)}

			{/* Stats row */}
			{trendStats && activeVariableKey && (
				<div className="flex items-center gap-4 px-4 pb-2 text-[11px]">
					<StatBadge label="Avg" value={trendStats.avg.toFixed(3)} />
					<StatBadge label="Min" value={trendStats.min.toFixed(3)} />
					<StatBadge label="Max" value={trendStats.max.toFixed(3)} />
					<div className="ml-auto flex items-center gap-1">
						<span className="text-muted-foreground">Δ</span>
						<span className={trendStats.change >= 0 ? "text-emerald-600" : "text-red-500"}>
							{trendStats.change >= 0 ? "+" : ""}{trendStats.change.toFixed(3)}
							{" "}({trendStats.changePct >= 0 ? "+" : ""}{trendStats.changePct.toFixed(1)}%)
						</span>
					</div>
				</div>
			)}

			{/* Charts section (expandable) */}
			{isExpanded && (environmentalData.length > 0 || weatherData.length > 0) && (
				<div className="border-t border-border px-4 py-3">
					<div className={cn(
						"grid gap-3",
						chartView === "combined" ? "grid-cols-2" : "grid-cols-1",
					)}>
						{/* Environmental Chart */}
						{(chartView === "env" || chartView === "combined") && envChartData.length > 0 && (
							<div>
								<h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
									Environmental Indices
								</h4>
								<ResponsiveContainer width="100%" height={chartView === "combined" ? 120 : 150}>
									<AreaChart data={envChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
										<XAxis
											dataKey="date"
											tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
											tickLine={false}
											axisLine={false}
											interval="preserveStartEnd"
										/>
										<YAxis
											tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
											tickLine={false}
											axisLine={false}
											domain={["auto", "auto"]}
										/>
										<Tooltip
											contentStyle={{
												fontSize: 11,
												backgroundColor: "hsl(var(--card))",
												border: "1px solid hsl(var(--border))",
												borderRadius: 6,
											}}
											labelStyle={{ fontSize: 10, fontWeight: 600 }}
										/>
										{/* Show active variable as filled area, others as lines */}
										{activeVariableKey && (
											<Area
												type="monotone"
												dataKey={activeVariableKey}
												stroke={ENV_VARIABLE_COLORS[activeVariableKey] ?? "hsl(var(--primary))"}
												fill={ENV_VARIABLE_COLORS[activeVariableKey] ?? "hsl(var(--primary))"}
												fillOpacity={0.15}
												strokeWidth={2}
												name={VARIABLE_LABELS[activeVariableKey] ?? activeVariableKey.toUpperCase()}
												dot={false}
												activeDot={{ r: 3 }}
											/>
										)}
										{/* Selected date reference line */}
										{selectedDate && (
											<ReferenceLine
												x={dayjs(selectedDate).format("MMM D")}
												stroke="hsl(var(--primary))"
												strokeDasharray="4 4"
												strokeWidth={1.5}
											/>
										)}
									</AreaChart>
								</ResponsiveContainer>
							</div>
						)}

						{/* Weather Chart */}
						{(chartView === "weather" || chartView === "combined") && weatherChartData.length > 0 && (
							<div>
								<h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
									Weather
								</h4>
								<ResponsiveContainer width="100%" height={chartView === "combined" ? 120 : 150}>
									<LineChart data={weatherChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
										<XAxis
											dataKey="dateShort"
											tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
											tickLine={false}
											axisLine={false}
											interval="preserveStartEnd"
										/>
										<YAxis
											yAxisId="temp"
											tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
											tickLine={false}
											axisLine={false}
											domain={["auto", "auto"]}
										/>
										<YAxis
											yAxisId="precip"
											orientation="right"
											tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
											tickLine={false}
											axisLine={false}
											domain={[0, "auto"]}
											hide
										/>
										<Tooltip
											contentStyle={{
												fontSize: 11,
												backgroundColor: "hsl(var(--card))",
												border: "1px solid hsl(var(--border))",
												borderRadius: 6,
											}}
											labelStyle={{ fontSize: 10, fontWeight: 600 }}
											formatter={(value, name) => {
												const v = Number(value);
												if (name === "Temperature") return [`${v.toFixed(1)}°C`, name];
												if (name === "Precipitation") return [`${v.toFixed(4)} kg/m²`, name];
												if (name === "Cloud Cover") return [`${v.toFixed(1)}%`, name];
												return [String(v), String(name)];
											}}
										/>
										<Line
											yAxisId="temp"
											type="monotone"
											dataKey="temperature"
											stroke="hsl(25, 95%, 53%)"
											strokeWidth={2}
											name="Temperature"
											dot={false}
											activeDot={{ r: 3 }}
										/>
										<Line
											yAxisId="precip"
											type="monotone"
											dataKey="precipitation"
											stroke="hsl(210, 80%, 55%)"
											strokeWidth={1.5}
											name="Precipitation"
											dot={false}
											strokeDasharray="3 3"
										/>
										{/* Selected date reference line */}
										{selectedDate && (
											<ReferenceLine
												x={dayjs(selectedDate).format("MMM D")}
												stroke="hsl(var(--primary))"
												strokeDasharray="4 4"
												strokeWidth={1.5}
												yAxisId="temp"
											/>
										)}
									</LineChart>
								</ResponsiveContainer>
								{/* Precipitation bar chart below */}
								{weatherChartData.some((d) => d.precipitation > 0) && (
									<ResponsiveContainer width="100%" height={40}>
										<BarChart data={weatherChartData} margin={{ top: 2, right: 8, bottom: 0, left: -20 }}>
											<Bar
												dataKey="precipitation"
												fill="hsl(210, 80%, 55%)"
												opacity={0.6}
												radius={[2, 2, 0, 0]}
											/>
											<XAxis dataKey="dateShort" hide />
										</BarChart>
									</ResponsiveContainer>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
}

// -----------------------------------------------------------
// Stat badge
// -----------------------------------------------------------

function StatBadge({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-1">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}
