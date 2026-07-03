import { memo, useMemo } from "react";
import {
	TrendingUp,
	TrendingDown,
	Minus,
	Droplets,
	MapPin,
	Layers,
	BarChart2,
	AlertTriangle,
	Info,
	AlertCircle,
	Leaf,
	ChevronRight,
} from "lucide-react";
import dayjs from "dayjs";

import { useEnvironmentalData } from "#/hooks/useEnvironmentalData";
import { useWeatherData } from "#/hooks/useWeatherData";
import { useInsights } from "#/hooks/useInsights";
import { useControls, useQueryContext } from "./ControlProvider";
import type { Zone as ApiZone, Level as ApiLevel, Variable } from "#/services/api";
import type { TrendDirection, ZoneInsight } from "#/types/api";
import { Separator } from "#/components/ui/separator";
import { Badge } from "#/components/ui/badge";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

const ENV_VARIABLE_KEYS = [
	"ndvi", "gndvi", "wdrvi", "msavi", "ndre", "cire", "ndmi", "ndwi",
] as const;

type EnvKey = typeof ENV_VARIABLE_KEYS[number];

const ENV_LABELS: Record<EnvKey, { label: string; description: string }> = {
	ndvi:  { label: "NDVI",  description: "Vegetation vigour" },
	gndvi: { label: "GNDVI", description: "Green chlorophyll" },
	wdrvi: { label: "WDRVI", description: "Wide dynamic range" },
	msavi: { label: "MSAVI", description: "Soil-adjusted veg." },
	ndre:  { label: "NDRE",  description: "Red-edge chlorophyll" },
	cire:  { label: "CIre",  description: "Canopy chlorophyll" },
	ndmi:  { label: "NDMI",  description: "Moisture content" },
	ndwi:  { label: "NDWI",  description: "Water body index" },
};

function toTempC(raw: number) {
	return raw;
}

function ndviHealthLabel(v: number): { label: string; color: string } {
	if (v >= 0.6) return { label: "Healthy",  color: "text-emerald-600 dark:text-emerald-400" };
	if (v >= 0.4) return { label: "Moderate", color: "text-lime-600 dark:text-lime-400" };
	if (v >= 0.2) return { label: "Sparse",   color: "text-amber-600 dark:text-amber-400" };
	return              { label: "Stressed",  color: "text-red-600 dark:text-red-400" };
}

function trendIcon(dir: TrendDirection) {
	if (dir === "increasing") return <TrendingUp   className="h-3 w-3 text-emerald-500" />;
	if (dir === "decreasing") return <TrendingDown  className="h-3 w-3 text-red-500" />;
	return                           <Minus         className="h-3 w-3 text-muted-foreground" />;
}

function severityIcon(s: ZoneInsight["severity"]) {
	if (s === "critical") return <AlertCircle   className="h-3.5 w-3.5 shrink-0 text-red-500" />;
	if (s === "warning")  return <AlertTriangle  className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
	return                       <Info           className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
}

function severityBadgeClass(s: ZoneInsight["severity"]) {
	if (s === "critical") return "border-red-200   bg-red-50   text-red-700   dark:border-red-800   dark:bg-red-900/20   dark:text-red-400";
	if (s === "warning")  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
	return                       "border-blue-200  bg-blue-50  text-blue-700  dark:border-blue-800  dark:bg-blue-900/20  dark:text-blue-400";
}

function SectionToggle({
	label,
	open,
	onToggle,
	badge,
}: {
	label: string;
	open: boolean;
	onToggle: () => void;
	badge?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50"
		>
			<ChevronRight
				className={cn(
					"h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
					open && "rotate-90",
				)}
			/>
			<span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
				{label}
			</span>
			{badge}
		</button>
	);
}

function StatRow({
	label,
	value,
	sub,
	trend,
}: {
	label: string;
	value: string;
	sub?: string;
	trend?: TrendDirection;
}) {
	return (
		<div className="flex items-center justify-between px-3 py-1.5">
			<div className="min-w-0">
				<span className="text-xs font-medium text-foreground">{label}</span>
				{sub && <span className="ml-1.5 text-[10px] text-muted-foreground">{sub}</span>}
			</div>
			<div className="flex items-center gap-1.5">
				<span className="tabular-nums text-xs font-semibold text-foreground">{value}</span>
				{trend && trendIcon(trend)}
			</div>
		</div>
	);
}

function EnvGrid({ data }: { data: Record<string, number> }) {
	return (
		<div className="grid grid-cols-2 gap-px bg-border mx-3 mb-2 rounded-lg overflow-hidden">
			{ENV_VARIABLE_KEYS.map((key) => {
				const val = data[key];
				if (val == null) return null;
				const meta = ENV_LABELS[key];
				return (
					<div key={key} className="flex items-center justify-between bg-background px-2.5 py-2">
						<div className="min-w-0">
							<p className="text-[10px] font-semibold text-foreground">{meta.label}</p>
							<p className="text-[9px] text-muted-foreground leading-tight">{meta.description}</p>
						</div>
						<span className="ml-2 shrink-0 tabular-nums text-xs font-bold text-foreground">
							{val.toFixed(3)}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function HUDSkeleton() {
	return (
		<div className="space-y-2 px-3 py-3">
			<Skeleton className="h-3 w-full" />
			<Skeleton className="h-3 w-5/6" />
			<Skeleton className="h-3 w-4/6" />
		</div>
	);
}

interface ZoneHUDProps {
	zones: ApiZone[];
	levels: ApiLevel[];
	variables: Variable[];
}

export const ZoneHUD = memo(function ZoneHUD({ zones, levels }: ZoneHUDProps) {
	const zoneId       = useQueryContext((s) => s.zoneId);
	const levelId      = useQueryContext((s) => s.levelId);
	const timeRange    = useQueryContext((s) => s.timeRange);
	const selectedDate = useControls((s) => s.selectedDate);

	if (!zoneId) return null;

	return (
		<ZoneHUDContent
			zoneId={zoneId}
			levelId={levelId}
			timeRange={timeRange}
			selectedDate={selectedDate}
			zones={zones}
			levels={levels}
		/>
	);
});

const ZoneHUDContent = memo(function ZoneHUDContent({
	zoneId,
	levelId,
	timeRange,
	selectedDate,
	zones,
	levels,
}: {
	zoneId: number;
	levelId: number | null;
	timeRange: { startTs: Date; endTs: Date };
	selectedDate: Date | null;
	zones: ApiZone[];
	levels: ApiLevel[];
}) {
	// Expand state — persisted in the controls store across zone changes
	const hudSections      = useControls((s) => s.hudSections);
	const toggleHudSection = useControls((s) => s.toggleHudSection);

	// Static zone reference
	const zone  = useMemo(() => zones.find((z) => z.zone_id === zoneId) ?? null, [zones, zoneId]);
	const level = useMemo(() => levels.find((l) => l.level_id === zone?.level_id) ?? null, [levels, zone]);

	// Data fetches
	const { data: envData = [], isLoading: envLoading } = useEnvironmentalData({
		zoneId,
		levelId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const { data: weatherData = [], isLoading: wxLoading } = useWeatherData({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const { data: analysis, isLoading: analysisLoading } = useInsights({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
		variableKeys: ["ndvi", "ndmi", "ndwi"],
	});

	// Snap env point to selected date, else latest
	const envPoint = useMemo(() => {
		if (!envData.length) return null;
		if (selectedDate) {
			const target = dayjs(selectedDate).format("YYYY-MM-DD");
			const match  = envData.find((d) => dayjs(d.timestamp).format("YYYY-MM-DD") === target);
			if (match) return match;
		}
		return envData[envData.length - 1];
	}, [envData, selectedDate]);

	const wxPoint     = weatherData.length > 0 ? weatherData[weatherData.length - 1] : null;
	const ndviMetric  = analysis?.metrics.find((m) => m.variable_key === "ndvi");
	const ndmiMetric  = analysis?.metrics.find((m) => m.variable_key === "ndmi");

	const insights = useMemo(() => {
		if (!analysis?.insights) return [];
		const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
		return [...analysis.insights].sort(
			(a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2),
		);
	}, [analysis]);

	const ndviHealth   = envPoint ? ndviHealthLabel(envPoint.ndvi) : null;
	const snapshotDate = envPoint ? dayjs(envPoint.timestamp).format("D MMM YYYY") : null;

	// Severity badge counts for the insight section header
	const insightCounts = useMemo(() => ({
		critical: insights.filter((i) => i.severity === "critical").length,
		warning:  insights.filter((i) => i.severity === "warning").length,
	}), [insights]);

	if (!zone) return null;

	const isLoading = (envLoading || wxLoading) && !envPoint && !wxPoint;

	return (
		<div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 w-64 animate-in fade-in slide-in-from-left-2 duration-300">
			<div className="rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 overflow-hidden">
				<ScrollArea className="max-h-[calc(100vh-12rem)]">

						<div className="px-3 pt-3 pb-2.5">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<h2 className="text-sm font-semibold text-foreground leading-tight truncate">
									{zone.name}
								</h2>
								<p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
									<MapPin className="h-3 w-3 shrink-0" />
									{zone.city}
								</p>
							</div>
							<Badge
								variant="outline"
								className="shrink-0 capitalize border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
							>
								{level?.level ?? ""}
							</Badge>
						</div>

						<div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
							<span className="flex items-center gap-1">
								<Layers className="h-3 w-3" />
								{(zone.area / 1_000_000).toFixed(2)} km²
							</span>
							{ndviHealth && !envLoading && (
								<span className={cn("flex items-center gap-1 font-medium", ndviHealth.color)}>
									<Leaf className="h-3 w-3" />
									{ndviHealth.label}
								</span>
							)}
							{envLoading && <Skeleton className="h-3 w-16" />}
						</div>
					</div>

					<Separator />

					{isLoading ? (
						<HUDSkeleton />
					) : (
						<>
							{envPoint && (
								<>
									<SectionToggle
										label={`Vegetation${snapshotDate ? ` · ${snapshotDate}` : ""}`}
										open={hudSections.vegetation}
										onToggle={() => toggleHudSection("vegetation")}
									/>
									{hudSections.vegetation && (
										<EnvGrid data={envPoint as unknown as Record<string, number>} />
									)}
								</>
							)}

							{(ndviMetric || ndmiMetric || analysisLoading) && (
								<>
									<Separator />
									<SectionToggle
										label="Analysis"
										open={hudSections.analysis}
										onToggle={() => toggleHudSection("analysis")}
										badge={
											ndviMetric && (
												<span className={cn("text-[10px] font-medium tabular-nums", ndviMetric.trend === "increasing" ? "text-emerald-600" : ndviMetric.trend === "decreasing" ? "text-red-500" : "text-muted-foreground")}>
													{ndviMetric.current.toFixed(3)}
												</span>
											)
										}
									/>
									{hudSections.analysis && (
										analysisLoading ? (
											<HUDSkeleton />
										) : (
											<div className="pb-1">
												{ndviMetric && (
													<>
														<StatRow
															label="NDVI current"
															value={ndviMetric.current.toFixed(3)}
															trend={ndviMetric.trend}
														/>
														<StatRow
															label="NDVI avg / range"
															value={ndviMetric.average.toFixed(3)}
															sub={`${ndviMetric.min_val.toFixed(2)}–${ndviMetric.max_val.toFixed(2)}`}
														/>
													</>
												)}
												{ndmiMetric && (
													<StatRow
														label="NDMI current"
														value={ndmiMetric.current.toFixed(3)}
														trend={ndmiMetric.trend}
													/>
												)}
											</div>
										)
									)}
								</>
							)}

							{wxPoint && (
								<>
									<Separator />
									<SectionToggle
										label="Weather"
										open={hudSections.weather}
										onToggle={() => toggleHudSection("weather")}
										badge={
											<span className="text-[10px] tabular-nums text-muted-foreground">
												{toTempC(wxPoint.temperature).toFixed(0)}°C
											</span>
										}
									/>
									{hudSections.weather && (
										<div className="pb-1">
											<StatRow
												label="Temperature"
												value={`${toTempC(wxPoint.temperature).toFixed(1)} °C`}
												sub={dayjs(wxPoint.timestamp).format("D MMM")}
											/>
											<StatRow
												label="Precipitation"
												value={`${(wxPoint.precipitation * 1000).toFixed(2)} mm`}
											/>
											<StatRow
												label="Cloud cover"
												value={`${Number(wxPoint.cloud_cover_pct).toFixed(1)}%`}
											/>
											{wxPoint.is_raining && (
												<div className="mx-3 mb-2 mt-0.5 flex items-center gap-2 rounded-lg bg-blue-50/80 px-2.5 py-1.5 dark:bg-blue-900/20">
													<Droplets className="h-3.5 w-3.5 text-blue-500" />
													<span className="text-[11px] text-blue-700 dark:text-blue-300">Currently raining</span>
												</div>
											)}
										</div>
									)}
								</>
							)}

							{insights.length > 0 && (
								<>
									<Separator />
									<SectionToggle
										label="Insights"
										open={hudSections.insights}
										onToggle={() => toggleHudSection("insights")}
										badge={
											<div className="flex items-center gap-1">
												{insightCounts.critical > 0 && (
													<Badge variant="outline" className="h-4 px-1 text-[9px] border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
														{insightCounts.critical}
													</Badge>
												)}
												{insightCounts.warning > 0 && (
													<Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
														{insightCounts.warning}
													</Badge>
												)}
											</div>
										}
									/>
									{hudSections.insights && (
										<ScrollArea className="h-48">
											<div className="px-3 pb-3 pt-0.5 space-y-1.5">
												{insights.map((insight, i) => (
													<div
														key={i}
														className={cn(
															"rounded-lg border px-2.5 py-2 text-[11px] leading-snug",
															severityBadgeClass(insight.severity),
														)}
													>
														<div className="flex items-start gap-1.5">
															{severityIcon(insight.severity)}
															<div className="min-w-0">
																<p className="font-medium leading-tight">{insight.title}</p>
																<p className="mt-0.5 text-[10px] opacity-80 leading-snug">
																	{insight.description}
																</p>
															</div>
														</div>
													</div>
												))}
											</div>
										</ScrollArea>
									)}
								</>
							)}

							{!envPoint && !wxPoint && !analysisLoading && (
								<div className="px-3 py-6 text-center">
									<BarChart2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
									<p className="text-xs text-muted-foreground">No data for this zone yet</p>
								</div>
							)}
						</>
					)}
				</ScrollArea>
			</div>
		</div>
	);
});
