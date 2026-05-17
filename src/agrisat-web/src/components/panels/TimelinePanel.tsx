import { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useStore } from "zustand";

import { Card, CardContent } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { DualRangeSlider } from "#/components/ui/range-slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";

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
	/** Callback when a single timestamp is selected (for raster update) */
	onTimestampSelect?: (ts: Date) => void;
	/** Message to display when raster is unavailable for selected timestamp */
	rasterUnavailableMessage?: string | null;
}

// -----------------------------------------------------------
// Constants
// -----------------------------------------------------------

const GAP_THRESHOLD_DAYS = 10;
const CHART_HEIGHT = 48;
const CHART_PADDING = 4;
const MIN_TICK_WIDTH = 16;
const MAX_TICK_WIDTH = 48;
const DEFAULT_TICK_WIDTH = 24;

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

/** Detect gaps > 10 days between consecutive timestamps */
function detectGaps(timestamps: Date[]): Array<{ startIdx: number; endIdx: number; days: number }> {
	const gaps: Array<{ startIdx: number; endIdx: number; days: number }> = [];
	for (let i = 1; i < timestamps.length; i++) {
		const diffDays = dayjs(timestamps[i]).diff(dayjs(timestamps[i - 1]), "day");
		if (diffDays > GAP_THRESHOLD_DAYS) {
			gaps.push({ startIdx: i - 1, endIdx: i, days: diffDays });
		}
	}
	return gaps;
}

/** Map a value to a position within a range */
function normalize(value: number, min: number, max: number): number {
	if (max === min) return 0.5;
	return (value - min) / (max - min);
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// -----------------------------------------------------------
// Sub-components
// -----------------------------------------------------------

/** SVG-based inline trend preview chart */
function TrendPreviewChart({
	data,
	variableKey,
}: {
	data: Array<{ ts: Date; value: number }>;
	variableKey: string;
}) {
	if (data.length < 2) return null;

	const values = data.map((d) => d.value);
	const minVal = Math.min(...values);
	const maxVal = Math.max(...values);

	const width = 100;
	const height = CHART_HEIGHT;
	const padY = CHART_PADDING;

	const points = data.map((d, i) => {
		const x = normalize(i, 0, data.length - 1) * width;
		const y = height - padY - normalize(d.value, minVal, maxVal) * (height - 2 * padY);
		return `${x},${y}`;
	});

	const polyline = points.join(" ");

	return (
		<div className="mt-2" aria-label={`Trend preview for ${variableKey}`}>
			<p className="mb-1 text-xs text-muted-foreground">
				Trend: <span className="font-medium text-foreground">{variableKey.toUpperCase()}</span>
			</p>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				preserveAspectRatio="none"
				className="h-12 w-full rounded-lg border border-border bg-muted/30"
				role="img"
				aria-label={`Line chart showing ${variableKey} trend over time`}
			>
				<polyline
					points={polyline}
					fill="none"
					stroke="hsl(var(--primary))"
					strokeWidth="1.5"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
				<span>{dayjs(data[0].ts).format("MMM D")}</span>
				<span>{dayjs(data[data.length - 1].ts).format("MMM D")}</span>
			</div>
		</div>
	);
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export default function TimelinePanel({
	store,
	availableTimestamps,
	trendData,
	activeVariableKey,
	onTimestampSelect,
	rasterUnavailableMessage,
}: TimelinePanelProps) {
	const timeRange = useStore(store, (s) => s.timeRange);
	const setTimeRange = useStore(store, (s) => s.setTimeRange);

	const [selectedTimestampIdx, setSelectedTimestampIdx] = useState<number | null>(null);
	const [tickWidth, setTickWidth] = useState(DEFAULT_TICK_WIDTH);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const dragStartX = useRef(0);
	const scrollStartX = useRef(0);

	// -----------------------------------------------------------
	// Derived state
	// -----------------------------------------------------------

	const sortedTimestamps = useMemo(
		() => [...availableTimestamps].sort((a, b) => a.getTime() - b.getTime()),
		[availableTimestamps],
	);

	const gaps = useMemo(() => detectGaps(sortedTimestamps), [sortedTimestamps]);

	const rangeIndices = useMemo(() => {
		if (sortedTimestamps.length === 0) return { start: 0, end: 0 };

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

		return { start: startIdx, end: endIdx };
	}, [sortedTimestamps, timeRange]);

	const gapStartIndices = useMemo(
		() => new Set(gaps.map((g) => g.startIdx)),
		[gaps],
	);

	// Determine which ticks should show a date label (show every Nth based on zoom)
	const labelInterval = useMemo(() => {
		if (tickWidth >= 40) return 1;
		if (tickWidth >= 28) return 2;
		if (tickWidth >= 20) return 3;
		return 5;
	}, [tickWidth]);

	// -----------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------

	const handleRangeChange = useCallback(
		(values: number[]) => {
			const [startIdx, endIdx] = values;
			if (
				startIdx < sortedTimestamps.length &&
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

	const handleTimestampClick = useCallback(
		(idx: number) => {
			setSelectedTimestampIdx(idx);
			if (onTimestampSelect && sortedTimestamps[idx]) {
				onTimestampSelect(sortedTimestamps[idx]);
			}
		},
		[sortedTimestamps, onTimestampSelect],
	);

	// Zoom via mouse wheel on the timeline
	const handleWheel = useCallback((e: React.WheelEvent) => {
		e.preventDefault();
		setTickWidth((prev) => {
			const delta = e.deltaY > 0 ? -2 : 2;
			return clamp(prev + delta, MIN_TICK_WIDTH, MAX_TICK_WIDTH);
		});
	}, []);

	// Pan via mouse drag on the timeline
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		// Only start drag on middle-click or when holding shift
		if (e.button === 1 || e.shiftKey) {
			e.preventDefault();
			isDragging.current = true;
			dragStartX.current = e.clientX;
			scrollStartX.current = scrollContainerRef.current?.scrollLeft ?? 0;
		}
	}, []);

	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		if (!isDragging.current) return;
		e.preventDefault();
		const dx = e.clientX - dragStartX.current;
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollLeft = scrollStartX.current - dx;
		}
	}, []);

	const handleMouseUp = useCallback(() => {
		isDragging.current = false;
	}, []);

	// -----------------------------------------------------------
	// Empty state
	// -----------------------------------------------------------

	if (sortedTimestamps.length === 0) {
		return (
			<section
				className="flex items-center justify-center border-t border-border bg-card px-4 py-6"
				aria-label="Timeline Panel"
			>
				<p className="text-sm text-muted-foreground">
					No data available for the current selection. Try selecting a different zone or level.
				</p>
			</section>
		);
	}

	// -----------------------------------------------------------
	// Render
	// -----------------------------------------------------------

	return (
		<section
			className="flex flex-col gap-3 border-t border-border bg-card px-4 py-3"
			aria-label="Timeline Panel"
		>
			{/* Raster unavailable message */}
			{rasterUnavailableMessage && (
				<Card size="sm" className="border-amber-200 bg-amber-50">
					<CardContent className="pt-3">
						<p className="text-xs text-amber-800" role="alert">
							{rasterUnavailableMessage}
						</p>
					</CardContent>
				</Card>
			)}

			{/* Timeline with selectable timestamps */}
			<div>
				<div className="mb-1 flex items-center justify-between">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Timeline
					</h3>
					<div className="flex items-center gap-2">
						<span className="text-[10px] text-muted-foreground">
							{sortedTimestamps.length} observations
						</span>
						<span className="text-[10px] text-muted-foreground/60">
							Scroll to zoom · Shift+drag to pan
						</span>
					</div>
				</div>

				{/* Zoomable/pannable timestamp strip */}
				<TooltipProvider>
					<div
						ref={scrollContainerRef}
						className="relative overflow-x-auto rounded-lg border border-border bg-muted/30"
						onWheel={handleWheel}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseUp}
						role="listbox"
						aria-label="Available timestamps"
					>
						<div
							className="flex items-end px-2 pb-1 pt-5"
							style={{ minWidth: `${sortedTimestamps.length * tickWidth + 16}px` }}
						>
							{sortedTimestamps.map((ts, idx) => {
								const isSelected = selectedTimestampIdx === idx;
								const isInRange = idx >= rangeIndices.start && idx <= rangeIndices.end;
								const hasGapAfter = gapStartIndices.has(idx);
								const gap = hasGapAfter ? gaps.find((g) => g.startIdx === idx) : null;
								const showLabel = idx % labelInterval === 0;

								return (
									<div key={ts.getTime()} className="flex flex-col items-center" style={{ width: `${tickWidth}px`, flexShrink: 0 }}>
										{/* Date label */}
										{showLabel && (
											<span className="mb-1 text-[9px] leading-none text-muted-foreground select-none">
												{dayjs(ts).format("M/D")}
											</span>
										)}
										{!showLabel && <span className="mb-1 h-[9px]" />}

										<div className="flex items-end">
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={() => handleTimestampClick(idx)}
														className={`flex shrink-0 rounded-sm transition-colors ${
															isSelected
																? "bg-primary shadow-sm shadow-primary/30"
																: isInRange
																	? "bg-primary/50 hover:bg-primary/70"
																	: "bg-border hover:bg-muted-foreground/50"
														}`}
														style={{
															width: `${Math.max(4, tickWidth * 0.35)}px`,
															height: `${isSelected ? 24 : isInRange ? 18 : 12}px`,
														}}
														role="option"
														aria-selected={isSelected}
														aria-label={`Select timestamp ${dayjs(ts).format("YYYY-MM-DD")}`}
													/>
												</TooltipTrigger>
												<TooltipContent side="top">
													<span className="font-medium">{dayjs(ts).format("ddd, MMM D, YYYY")}</span>
												</TooltipContent>
											</Tooltip>

											{/* Data gap indicator */}
											{hasGapAfter && gap && (
												<div
													className="mx-0.5 flex items-center self-center"
													title={`Data gap: ${gap.days} days`}
													aria-label={`Data gap of ${gap.days} days`}
												>
													<div className="h-px w-2 border-t border-dashed border-muted-foreground/50" />
													<span className="mx-0.5 text-[8px] font-medium text-muted-foreground/70">
														{gap.days}d
													</span>
													<div className="h-px w-2 border-t border-dashed border-muted-foreground/50" />
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</TooltipProvider>
			</div>

			{/* Range selection slider */}
			{sortedTimestamps.length > 1 && (
			<div className="space-y-6">
				<Label className="text-xs font-medium text-muted-foreground">
					Range Selection
				</Label>
				<DualRangeSlider
					min={0}
					max={sortedTimestamps.length - 1}
					value={[rangeIndices.start, rangeIndices.end]}
					onValueChange={handleRangeChange}
					label={(idx) =>
						idx != null && sortedTimestamps[idx]
							? dayjs(sortedTimestamps[idx]).format("MMM D")
							: null
					}
					labelPosition="top"
					aria-label="Time range selection"
				/>
				<p className="text-[10px] text-muted-foreground">
					Selected: {dayjs(sortedTimestamps[rangeIndices.start]).format("MMM D, YYYY")} — {dayjs(sortedTimestamps[rangeIndices.end]).format("MMM D, YYYY")}
				</p>
			</div>
			)}

			{/* Trend preview chart */}
			{activeVariableKey && trendData.length >= 2 && (
				<TrendPreviewChart data={trendData} variableKey={activeVariableKey} />
			)}
		</section>
	);
}
