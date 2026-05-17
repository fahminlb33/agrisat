import { useMemo } from "react";
import { useStore } from "zustand";
import type {
	TrendDirection,
	ZoneInsight,
	InsightSeverity,
	ComparisonResult,
	ComparisonDelta,
} from "#/types/api";

import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Separator } from "#/components/ui/separator";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface EnvironmentalTimePoint {
	timestamp: string;
	zone_id: number;
	zone_name: string;
	zone_city: string;
	level_id: number;
	level: string;
	ndvi: number;
	gndvi: number;
	wdrvi: number;
	msavi: number;
	ndre: number;
	cire: number;
	ndmi: number;
	ndwi: number;
}

export interface WeatherTimePoint {
	timestamp: string;
	zone_id: number;
	zone_name: string;
	zone_city: string;
	level_id: number;
	level: string;
	temperature: number;
	precipitation: number;
	cloud_cover_pct: number;
	is_raining: boolean;
}

export interface ZoneInfo {
	zoneId: number;
	zoneName: string;
	level: string;
	city: string;
}

export interface VariableMetric {
	variableKey: string;
	current: number;
	average: number;
	min: number;
	max: number;
	trend: TrendDirection;
	trendMagnitude: number;
}

export interface WeatherSummary {
	currentTemperature: number | null;
	avgTemperature: number | null;
	totalPrecipitation: number | null;
	avgCloudCover: number | null;
}

export interface DataSourceAttribution {
	satelliteName: string;
	lastObservationDate: string; // ISO 8601 format
}

export interface AnalysisPanelProps {
	store: ReturnType<typeof import("#/stores/query-context").createQueryContextStore>;
	environmentalData: EnvironmentalTimePoint[];
	weatherData: WeatherTimePoint[];
	zoneInfo: ZoneInfo | null;
	insights?: ZoneInsight[];
	comparisonResult?: ComparisonResult | null;
	comparisonTargetAName?: string;
	comparisonTargetBName?: string;
	comparisonMissingData?: "target_a" | "target_b" | "both" | null;
	dataSource?: DataSourceAttribution | null;
}

// -----------------------------------------------------------
// Metrics computation
// -----------------------------------------------------------

export function computeTrend(
	values: number[],
	threshold = 0.001,
): { direction: TrendDirection; magnitude: number } {
	const n = values.length;
	if (n < 2) {
		return { direction: "stable", magnitude: 0 };
	}

	const xMean = (n - 1) / 2;
	const yMean = values.reduce((sum, v) => sum + v, 0) / n;

	let numerator = 0;
	let denominator = 0;

	for (let i = 0; i < n; i++) {
		const xDiff = i - xMean;
		numerator += xDiff * (values[i] - yMean);
		denominator += xDiff * xDiff;
	}

	if (denominator === 0) {
		return { direction: "stable", magnitude: 0 };
	}

	const slope = numerator / denominator;

	if (Math.abs(slope) < threshold) {
		return { direction: "stable", magnitude: slope };
	}
	if (slope > 0) {
		return { direction: "increasing", magnitude: slope };
	}
	return { direction: "decreasing", magnitude: slope };
}

export function computeZoneMetrics(
	timeSeries: EnvironmentalTimePoint[],
	variableKey: string,
): VariableMetric | null {
	if (timeSeries.length === 0) {
		return null;
	}

	const values = timeSeries.map(
		(point) => point[variableKey as keyof EnvironmentalTimePoint] as number,
	);

	const current = values[values.length - 1];
	const sum = values.reduce((acc, v) => acc + v, 0);
	const average = sum / values.length;
	const min = Math.min(...values);
	const max = Math.max(...values);

	let trend: TrendDirection = "stable";
	let trendMagnitude = 0;

	if (values.length >= 2) {
		const result = computeTrend(values);
		trend = result.direction;
		trendMagnitude = result.magnitude;
	}

	return {
		variableKey,
		current,
		average,
		min,
		max,
		trend,
		trendMagnitude,
	};
}

export function computeWeatherSummary(
	weatherData: WeatherTimePoint[],
): WeatherSummary {
	if (weatherData.length === 0) {
		return {
			currentTemperature: null,
			avgTemperature: null,
			totalPrecipitation: null,
			avgCloudCover: null,
		};
	}

	const currentTemperature = weatherData[weatherData.length - 1].temperature;
	const avgTemperature =
		weatherData.reduce((sum, w) => sum + w.temperature, 0) / weatherData.length;
	const totalPrecipitation = weatherData.reduce(
		(sum, w) => sum + w.precipitation,
		0,
	);
	const avgCloudCover =
		weatherData.reduce((sum, w) => sum + w.cloud_cover_pct, 0) /
		weatherData.length;

	return {
		currentTemperature,
		avgTemperature,
		totalPrecipitation,
		avgCloudCover,
	};
}

// -----------------------------------------------------------
// Sub-components
// -----------------------------------------------------------

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

function TrendIndicator({ trend }: { trend: TrendDirection }) {
	if (trend === "increasing") {
		return (
			<Badge variant="outline" className="border-green-200 bg-green-50 text-green-700" aria-label="Trend: increasing">
				↑ Increasing
			</Badge>
		);
	}
	if (trend === "decreasing") {
		return (
			<Badge variant="outline" className="border-red-200 bg-red-50 text-red-700" aria-label="Trend: decreasing">
				↓ Decreasing
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-muted-foreground" aria-label="Trend: stable">
			→ Stable
		</Badge>
	);
}

function MetricCard({ metric, dataPointCount }: { metric: VariableMetric; dataPointCount: number }) {
	return (
		<Card size="sm">
			<CardHeader className="pb-1">
				<CardTitle className="flex items-center justify-between text-sm">
					<span>{VARIABLE_LABELS[metric.variableKey] ?? metric.variableKey.toUpperCase()}</span>
					{dataPointCount >= 2 ? (
						<TrendIndicator trend={metric.trend} />
					) : (
						<span className="text-xs text-muted-foreground" aria-label="Trend unavailable">
							— No trend
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div>
						<span className="block text-muted-foreground">Current</span>
						<span className="font-medium text-foreground">
							{metric.current.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">Average</span>
						<span className="font-medium text-foreground">
							{metric.average.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">Min</span>
						<span className="font-medium text-foreground">
							{metric.min.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">Max</span>
						<span className="font-medium text-foreground">
							{metric.max.toFixed(4)}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function WeatherCard({ summary }: { summary: WeatherSummary }) {
	if (
		summary.currentTemperature === null &&
		summary.avgTemperature === null &&
		summary.totalPrecipitation === null &&
		summary.avgCloudCover === null
	) {
		return null;
	}

	return (
		<Card size="sm">
			<CardHeader className="pb-1">
				<CardTitle className="text-sm">Weather</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-2 text-xs">
					{summary.currentTemperature !== null && (
						<div>
							<span className="block text-muted-foreground">Temperature</span>
							<span className="font-medium text-foreground">
								{summary.currentTemperature.toFixed(1)} °C
							</span>
						</div>
					)}
					{summary.avgTemperature !== null && (
						<div>
							<span className="block text-muted-foreground">Avg Temp</span>
							<span className="font-medium text-foreground">
								{summary.avgTemperature.toFixed(1)} °C
							</span>
						</div>
					)}
					{summary.totalPrecipitation !== null && (
						<div>
							<span className="block text-muted-foreground">Precipitation</span>
							<span className="font-medium text-foreground">
								{summary.totalPrecipitation.toFixed(1)} mm
							</span>
						</div>
					)}
					{summary.avgCloudCover !== null && (
						<div>
							<span className="block text-muted-foreground">Cloud Cover</span>
							<span className="font-medium text-foreground">
								{summary.avgCloudCover.toFixed(1)} %
							</span>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

// -----------------------------------------------------------
// Insights sub-components
// -----------------------------------------------------------

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
	critical: 0,
	warning: 1,
	info: 2,
};

const SEVERITY_BADGE_VARIANT: Record<InsightSeverity, { className: string; icon: string }> = {
	critical: {
		className: "border-red-200 bg-red-50 text-red-800",
		icon: "🔴",
	},
	warning: {
		className: "border-amber-200 bg-amber-50 text-amber-800",
		icon: "🟡",
	},
	info: {
		className: "border-blue-200 bg-blue-50 text-blue-800",
		icon: "🔵",
	},
};

function SeverityBadge({ severity }: { severity: InsightSeverity }) {
	const style = SEVERITY_BADGE_VARIANT[severity];
	return (
		<Badge variant="outline" className={style.className} aria-label={`Severity: ${severity}`}>
			<span aria-hidden="true">{style.icon}</span>
			{severity}
		</Badge>
	);
}

function InsightCard({ insight }: { insight: ZoneInsight }) {
	return (
		<Card size="sm">
			<CardContent className="pt-3">
				<div className="mb-1 flex items-center justify-between gap-2">
					<h4 className="text-xs font-semibold text-foreground">
						{insight.title}
					</h4>
					<SeverityBadge severity={insight.severity} />
				</div>
				<p className="text-xs text-muted-foreground">
					{insight.description}
				</p>
			</CardContent>
		</Card>
	);
}

function InsightsSection({ insights }: { insights: ZoneInsight[] }) {
	const sorted = useMemo(
		() => [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
		[insights],
	);

	if (sorted.length === 0) return null;

	return (
		<section aria-labelledby="insights-label">
			<h3
				id="insights-label"
				className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
			>
				Insights
			</h3>
			<div className="flex flex-col gap-2">
				{sorted.map((insight, idx) => (
					<InsightCard key={`${insight.type}-${insight.variable_key ?? ""}-${idx}`} insight={insight} />
				))}
			</div>
		</section>
	);
}

// -----------------------------------------------------------
// Comparison sub-components
// -----------------------------------------------------------

function ComparisonDeltaRow({ delta, targetAName, targetBName }: {
	delta: ComparisonDelta;
	targetAName: string;
	targetBName: string;
}) {
	const label = VARIABLE_LABELS[delta.variable_key] ?? delta.variable_key.toUpperCase();

	return (
		<Card size="sm">
			<CardHeader className="pb-1">
				<CardTitle className="text-xs">{label}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div>
						<span className="block text-muted-foreground">{targetAName}</span>
						<span className="font-medium text-foreground">
							{delta.value_a.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">{targetBName}</span>
						<span className="font-medium text-foreground">
							{delta.value_b.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">Abs. Diff</span>
						<span className="font-medium text-foreground">
							{delta.absolute_diff >= 0 ? "+" : ""}
							{delta.absolute_diff.toFixed(4)}
						</span>
					</div>
					<div>
						<span className="block text-muted-foreground">Rel. Diff</span>
						<span className="font-medium text-foreground">
							{delta.relative_diff_pct >= 0 ? "+" : ""}
							{delta.relative_diff_pct.toFixed(1)}%
						</span>
					</div>
				</div>
				<p className="mt-2 text-xs italic text-muted-foreground">
					{delta.interpretation}
				</p>
			</CardContent>
		</Card>
	);
}

function ComparisonView({
	comparisonResult,
	targetAName,
	targetBName,
	missingData,
}: {
	comparisonResult: ComparisonResult;
	targetAName: string;
	targetBName: string;
	missingData?: "target_a" | "target_b" | "both" | null;
}) {
	if (missingData) {
		let message: string;
		if (missingData === "both") {
			message = `No data available for both "${targetAName}" and "${targetBName}". Comparison cannot be completed.`;
		} else if (missingData === "target_a") {
			message = `No data available for "${targetAName}". Comparison cannot be completed.`;
		} else {
			message = `No data available for "${targetBName}". Comparison cannot be completed.`;
		}

		return (
			<section aria-labelledby="comparison-label">
				<h3
					id="comparison-label"
					className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
				>
					Comparison
				</h3>
				<Card size="sm" className="border-amber-200 bg-amber-50">
					<CardContent className="pt-3">
						<p className="text-xs text-amber-800" role="status">
							{message}
						</p>
					</CardContent>
				</Card>
			</section>
		);
	}

	return (
		<section aria-labelledby="comparison-label">
			<h3
				id="comparison-label"
				className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
			>
				Comparison: {targetAName} vs {targetBName}
			</h3>
			<div className="flex flex-col gap-2">
				{comparisonResult.deltas.map((delta) => (
					<ComparisonDeltaRow
						key={delta.variable_key}
						delta={delta}
						targetAName={targetAName}
						targetBName={targetBName}
					/>
				))}
			</div>
		</section>
	);
}

// -----------------------------------------------------------
// Data source attribution
// -----------------------------------------------------------

function DataSourceFooter({ dataSource }: { dataSource: DataSourceAttribution }) {
	return (
		<footer className="mt-auto border-t border-border pt-3">
			<p className="text-[10px] text-muted-foreground">
				<span className="font-medium">Source:</span> {dataSource.satelliteName}
			</p>
			<p className="text-[10px] text-muted-foreground">
				<span className="font-medium">Last observation:</span>{" "}
				<time dateTime={dataSource.lastObservationDate}>
					{dataSource.lastObservationDate}
				</time>
			</p>
		</footer>
	);
}

// -----------------------------------------------------------
// Main Component
// -----------------------------------------------------------

export default function AnalysisPanel({
	store,
	environmentalData,
	weatherData,
	zoneInfo,
	insights,
	comparisonResult,
	comparisonTargetAName,
	comparisonTargetBName,
	comparisonMissingData,
	dataSource,
}: AnalysisPanelProps) {
	const zoneId = useStore(store, (s) => s.zoneId);
	const comparisonMode = useStore(store, (s) => s.comparisonMode);

	const metrics = useMemo(() => {
		if (environmentalData.length === 0) return [];

		const ENV_KEYS = ["ndvi", "gndvi", "wdrvi", "msavi", "ndre", "cire", "ndmi", "ndwi"];

		const results: VariableMetric[] = [];
		for (const key of ENV_KEYS) {
			const metric = computeZoneMetrics(environmentalData, key);
			if (metric) {
				results.push(metric);
			}
		}
		return results;
	}, [environmentalData]);

	const weatherSummary = useMemo(
		() => computeWeatherSummary(weatherData),
		[weatherData],
	);

	// -----------------------------------------------------------
	// Empty state: no zone selected
	// -----------------------------------------------------------
	if (zoneId === null) {
		return (
			<aside
				className="flex h-full flex-col items-center justify-center border-l border-border bg-card p-4"
				aria-label="Analysis Panel"
			>
				<div className="text-center">
					<p className="text-sm text-muted-foreground">
						Select a zone to view analysis
					</p>
				</div>
			</aside>
		);
	}

	// -----------------------------------------------------------
	// Empty state: no data available
	// -----------------------------------------------------------
	if (environmentalData.length === 0 && weatherData.length === 0) {
		return (
			<aside
				className="flex h-full flex-col border-l border-border bg-card p-4"
				aria-label="Analysis Panel"
			>
				{zoneInfo && (
					<div className="mb-4">
						<h2 className="text-base font-semibold text-foreground">
							{zoneInfo.zoneName}
						</h2>
						<p className="text-xs text-muted-foreground">
							{zoneInfo.level} · {zoneInfo.city}
						</p>
					</div>
				)}
				<div className="flex flex-1 items-center justify-center">
					<p className="text-center text-sm text-muted-foreground" role="status">
						No data available for the selected zone and time range.
						Try expanding the time range.
					</p>
				</div>
			</aside>
		);
	}

	// -----------------------------------------------------------
	// Data available
	// -----------------------------------------------------------
	const dataPointCount = environmentalData.length;

	return (
		<aside
			className="flex h-full flex-col border-l border-border bg-card"
			aria-label="Analysis Panel"
		>
			<ScrollArea className="h-full">
				<div className="flex flex-col gap-4 p-4">
					{/* Zone header */}
					{zoneInfo && (
						<div>
							<h2 className="text-base font-semibold text-foreground">
								{zoneInfo.zoneName}
							</h2>
							<p className="text-xs text-muted-foreground">
								{zoneInfo.level} · {zoneInfo.city}
							</p>
						</div>
					)}

					{/* Single-point notice */}
					{dataPointCount === 1 && (
						<p className="text-xs text-muted-foreground" role="status">
							Only 1 data point available — trend cannot be computed.
						</p>
					)}

					{/* Environmental metrics */}
					{metrics.length > 0 && (
						<section aria-labelledby="env-metrics-label">
							<h3
								id="env-metrics-label"
								className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Environmental Indices
							</h3>
							<div className="flex flex-col gap-2">
								{metrics.map((metric) => (
									<MetricCard
										key={metric.variableKey}
										metric={metric}
										dataPointCount={dataPointCount}
									/>
								))}
							</div>
						</section>
					)}

					{/* Weather summary */}
					{weatherData.length > 0 && (
						<section aria-labelledby="weather-label">
							<h3
								id="weather-label"
								className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Weather Summary
							</h3>
							<WeatherCard summary={weatherSummary} />
						</section>
					)}

					{/* Insights section */}
					{insights && insights.length > 0 && (
						<InsightsSection insights={insights} />
					)}

					{/* Comparison view */}
					{comparisonMode && comparisonResult && (
						<ComparisonView
							comparisonResult={comparisonResult}
							targetAName={comparisonTargetAName ?? "Target A"}
							targetBName={comparisonTargetBName ?? "Target B"}
							missingData={comparisonMissingData}
						/>
					)}

					{/* Comparison missing data without result */}
					{comparisonMode && !comparisonResult && comparisonMissingData && (
						<section aria-labelledby="comparison-missing-label">
							<h3
								id="comparison-missing-label"
								className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Comparison
							</h3>
							<Card size="sm" className="border-amber-200 bg-amber-50">
								<CardContent className="pt-3">
									<p className="text-xs text-amber-800" role="status">
										Comparison cannot be completed due to missing data for one or both targets.
									</p>
								</CardContent>
							</Card>
						</section>
					)}

					{/* Data source attribution */}
					{dataSource && (
						<>
							<Separator />
							<DataSourceFooter dataSource={dataSource} />
						</>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
