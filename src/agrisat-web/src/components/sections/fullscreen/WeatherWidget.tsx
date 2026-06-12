import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Cloud,
	CloudRain,
	ChevronDown,
	Droplets,
	Sun,
	Thermometer,
	Wind,
} from "lucide-react";
import dayjs from "dayjs";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Line,
	LineChart,
	YAxis,
} from "recharts";

import { useWeatherData } from "#/hooks/useWeatherData";
import { useEnvironmentalData } from "#/hooks/useEnvironmentalData";
import { useControls, useQueryContext } from "./ControlProvider";
import type { WeatherTimePoint } from "#/types/api";
import { cn } from "#/lib/utils";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Separator } from "#/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { ChartContainer, type ChartConfig } from "#/components/ui/chart";

const chartConfig = {
	temperature: {
		label: "Temperature",
		color: "hsl(25 95% 53%)",
	},
	precipitation: {
		label: "Precipitation",
		color: "hsl(210 80% 55%)",
	},
	cloudCover: {
		label: "Cloud Cover",
		color: "hsl(220 10% 60%)",
	},
} satisfies ChartConfig;

function toTempC(raw: number): number {
	return raw > 100 ? raw - 273.15 : raw;
}

function formatTemp(raw: number): string {
	return `${toTempC(raw).toFixed(0)}°`;
}

interface ChartDataPoint {
	date: string;
	fullDate: string;
	timestamp: string;
	temperature: number;
	precipitation: number;
	cloudCover: number;
	isRaining: boolean;
}

function StatTile({
	icon: Icon,
	value,
	label,
	colorClass,
	bgClass,
}: {
	icon: React.ElementType;
	value: string;
	label: string;
	colorClass: string;
	bgClass: string;
}) {
	return (
		<div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2", bgClass)}>
			<Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-foreground">{value}</div>
				<div className="text-[9px] text-muted-foreground">{label}</div>
			</div>
		</div>
	);
}

const WeatherSummaryCards = memo(function WeatherSummaryCards({
	weather,
	precipitation,
	envData,
}: {
	weather: WeatherTimePoint;
	precipitation: number;
	envData: { ndvi: number; ndmi: number } | null;
}) {
	const tempC = toTempC(weather.temperature);

	return (
		<div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
			<StatTile
				icon={Thermometer}
				value={`${tempC.toFixed(1)}°C`}
				label="Temp"
				colorClass="text-orange-500"
				bgClass="bg-orange-50/80 dark:bg-orange-900/20"
			/>
			<StatTile
				icon={Droplets}
				value={`${precipitation.toFixed(2)}mm`}
				label="Rain"
				colorClass="text-blue-500"
				bgClass="bg-blue-50/80 dark:bg-blue-900/20"
			/>
			<StatTile
				icon={
					weather.is_raining
						? CloudRain
						: weather.cloud_cover_pct > 50
							? Cloud
							: Sun
				}
				value={`${Number(weather.cloud_cover_pct).toFixed(1)}%`}
				label="Cloud"
				colorClass={
					weather.is_raining
						? "text-blue-400"
						: weather.cloud_cover_pct > 50
							? "text-muted-foreground"
							: "text-amber-400"
				}
				bgClass="bg-muted/40"
			/>
			{envData ? (
				<StatTile
					icon={Wind}
					value={envData.ndvi.toFixed(2)}
					label="NDVI"
					colorClass="text-emerald-500"
					bgClass="bg-emerald-50/80 dark:bg-emerald-900/20"
				/>
			) : (
				<div className="rounded-lg bg-muted/20" />
			)}
		</div>
	);
});

function ChartRow({
	label,
	children,
	height,
	className,
}: {
	label: string;
	children: React.ReactNode;
	height: number;
	className?: string;
}) {
	return (
		<div className={className}>
			<p className="mb-0.5 text-[10px] font-medium text-muted-foreground">{label}</p>
			<ChartContainer
				config={chartConfig}
				className="w-full"
				style={{ height }}
				initialDimension={{ width: 500, height }}
			>
				{children as React.ReactElement}
			</ChartContainer>
		</div>
	);
}

export const WeatherWidget = memo(function WeatherWidget() {
	const zoneId = useQueryContext((s) => s.zoneId);
	const levelId = useQueryContext((s) => s.levelId);
	const timeRange = useQueryContext((s) => s.timeRange);

	const { data: weatherData = [] } = useWeatherData({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const { data: envData = [] } = useEnvironmentalData({
		zoneId,
		levelId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const expanded = useControls((s) => s.weatherExpanded);
	const toggleExpanded = useControls((s) => s.toggleWeatherExpanded);

	const chartData: ChartDataPoint[] = useMemo(
		() =>
			weatherData.map((d) => ({
				date: dayjs(d.timestamp).format("MMM D"),
				fullDate: dayjs(d.timestamp).format("YYYY-MM-DD"),
				timestamp: d.timestamp,
				temperature: Number(toTempC(d.temperature).toFixed(1)),
				precipitation: Number((d.precipitation * 1000).toFixed(2)),
				cloudCover: d.cloud_cover_pct,
				isRaining: d.is_raining,
			})),
		[weatherData],
	);

	const [localIndex, setLocalIndex] = useState<number>(() =>
		chartData.length > 0 ? chartData.length - 1 : 0,
	);

	useEffect(() => {
		if (chartData.length === 0) return;
		setLocalIndex((prev) => Math.min(prev, chartData.length - 1));
	}, [chartData.length]);

	const chartAreaRef = useRef<HTMLDivElement>(null);
	const isDraggingRef = useRef(false);
	const lastScrubIndexRef = useRef(0);

	const getIndexFromEvent = useCallback(
		(clientX: number): number => {
			const el = chartAreaRef.current;
			if (!el || chartData.length <= 1) return 0;
			const rect = el.getBoundingClientRect();
			const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return Math.round(ratio * (chartData.length - 1));
		},
		[chartData.length],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			isDraggingRef.current = true;
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			const idx = getIndexFromEvent(e.clientX);
			lastScrubIndexRef.current = idx;
			setLocalIndex(idx);
		},
		[getIndexFromEvent],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDraggingRef.current) return;
			const idx = getIndexFromEvent(e.clientX);
			if (idx !== lastScrubIndexRef.current) {
				lastScrubIndexRef.current = idx;
				setLocalIndex(idx);
			}
		},
		[getIndexFromEvent],
	);

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
	}, []);

	const currentWeather = weatherData[localIndex] ?? null;

	const currentEnvData = useMemo(() => {
		if (!envData.length || !chartData.length) return null;
		const targetDate = chartData[localIndex]?.fullDate;
		if (!targetDate) return null;
		const match = envData.find(
			(d) => dayjs(d.timestamp).format("YYYY-MM-DD") === targetDate,
		);
		return match ? { ndvi: match.ndvi, ndmi: match.ndmi } : null;
	}, [envData, chartData, localIndex]);

	const latestWeather = weatherData.length > 0 ? weatherData[weatherData.length - 1] : null;

	const scrubPercent =
		chartData.length > 1 ? (localIndex / (chartData.length - 1)) * 100 : 50;

	const selectedDateStr = chartData[localIndex]?.date;

	if (weatherData.length === 0) return null;

	return (
		<div
			className={cn(
				"rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 ease-in",
				expanded ? "w-full md:w-[560px]" : "w-[120px] md:w-[280px]",
			)}
		>
			{/* Header row */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						onClick={toggleExpanded}
						className="flex h-auto w-full items-center gap-2 rounded-xl px-3 py-2.5"
					>
						{latestWeather?.is_raining ? (
							<CloudRain className="h-4 w-4 shrink-0 text-blue-500" />
						) : (
							<Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />
						)}

						{latestWeather && (
							<>
								<div className="flex items-baseline gap-0.5">
									<span className="text-sm font-semibold text-foreground">
										{formatTemp(latestWeather.temperature)}
									</span>
									<span className="text-xs text-muted-foreground">C</span>
								</div>

								<Separator orientation="vertical" className="hidden sm:block h-4" />

								<div className="hidden sm:flex items-center gap-1">
									<Droplets className="h-3.5 w-3.5 text-blue-400" />
									<span className="text-xs text-muted-foreground">
										{(chartData[chartData.length - 1]?.precipitation ?? 0).toFixed(2)}mm
									</span>
								</div>

								<Separator orientation="vertical" className="hidden sm:block h-4" />

								<div className="hidden sm:flex items-center gap-1">
									<Cloud className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="text-xs text-muted-foreground">
										{Number(latestWeather.cloud_cover_pct).toFixed(1)}%
									</span>
								</div>
							</>
						)}

						<ChevronDown
							className={cn(
								"ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-100",
								expanded && "rotate-180",
							)}
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{expanded ? "Collapse weather panel" : "Expand weather charts"}
				</TooltipContent>
			</Tooltip>

			{/* Expanded panel */}
			<div
				className={cn(
					"overflow-hidden transition-all duration-100 ease-in-out",
					expanded && chartData.length > 1
						? "max-h-[520px] opacity-100"
						: "max-h-0 opacity-0",
				)}
			>
				<Separator />

				{/* Date range + scrub badge */}
				<div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
					<span className="text-[10px] text-muted-foreground">
						{chartData[0]?.date} — {chartData[chartData.length - 1]?.date}
					</span>
					<Badge
						variant="outline"
						className="tabular-nums border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
					>
						{selectedDateStr ?? "—"}
					</Badge>
				</div>

				{/* Summary stat tiles */}
				{currentWeather && (
					<WeatherSummaryCards
						weather={currentWeather}
						precipitation={chartData[localIndex]?.precipitation ?? 0}
						envData={currentEnvData}
					/>
				)}

				<Separator className="mx-3 w-auto" />

				{/* Scrub chart area */}
				<div
					ref={chartAreaRef}
					className="relative cursor-col-resize select-none px-3 pb-3 pt-2"
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
				>
					{/* Vertical scrub line */}
					<div
						className="pointer-events-none absolute top-2 bottom-3 z-20 w-px bg-blue-500/60"
						style={{
							left: `calc(12px + (100% - 24px) * ${scrubPercent / 100})`,
						}}
					/>

					{/* Temperature */}
					<ChartRow label="Temperature" height={55}>
						<AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
							<defs>
								<linearGradient id="wTempGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--color-temperature)" stopOpacity={0.3} />
									<stop offset="100%" stopColor="var(--color-temperature)" stopOpacity={0} />
								</linearGradient>
							</defs>
							<YAxis hide domain={["auto", "auto"]} />
							<Area
								type="monotone"
								dataKey="temperature"
								stroke="var(--color-temperature)"
								fill="url(#wTempGrad)"
								strokeWidth={1.5}
								dot={false}
								isAnimationActive={false}
							/>
						</AreaChart>
					</ChartRow>

					{/* Precipitation */}
					<ChartRow label="Precipitation" height={40} className="mt-2">
						<BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
							<YAxis hide domain={[0, "auto"]} />
							<Bar
								dataKey="precipitation"
								fill="var(--color-precipitation)"
								radius={[2, 2, 0, 0]}
								opacity={0.75}
								isAnimationActive={false}
							/>
						</BarChart>
					</ChartRow>

					{/* Cloud Cover */}
					<ChartRow label="Cloud Cover" height={35} className="mt-2">
						<LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
							<YAxis hide domain={[0, 100]} />
							<Line
								type="monotone"
								dataKey="cloudCover"
								stroke="var(--color-cloudCover)"
								strokeWidth={1.5}
								dot={false}
								isAnimationActive={false}
							/>
						</LineChart>
					</ChartRow>
				</div>
			</div>
		</div>
	);
});
