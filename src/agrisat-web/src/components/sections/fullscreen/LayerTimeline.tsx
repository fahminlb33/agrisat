import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Layers, Pause, Play, ChevronDown, Search } from "lucide-react";
import dayjs from "dayjs";

import type { Variable } from "#/services/api";
import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { Badge } from "#/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "#/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

interface LayerTimelineProps {
	timestamps: Date[];
	selectedDate: Date | null;
	onSelectDate: (date: Date) => void;
	variableKey: string;
	variables: Variable[];
	activeVariableId: number | null;
	onSelectVariable: (variableId: number) => void;
	datePickerOpen: boolean;
	onToggleDatePicker: () => void;
}

export const LayerTimeline = memo(function LayerTimeline({
	timestamps,
	selectedDate,
	onSelectDate,
	variableKey,
	variables,
	activeVariableId,
	onSelectVariable,
	datePickerOpen,
	onToggleDatePicker,
}: LayerTimelineProps) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [layerPickerOpen, setLayerPickerOpen] = useState(false);
	const [layerSearch, setLayerSearch] = useState("");
	const layerSearchRef = useRef<HTMLInputElement>(null);
	const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const selectedIdx = useMemo(() => {
		if (!selectedDate) return timestamps.length - 1;
		const target = dayjs(selectedDate).format("YYYY-MM-DD");
		const idx = timestamps.findIndex((t) => dayjs(t).format("YYYY-MM-DD") === target);
		return idx >= 0 ? idx : timestamps.length - 1;
	}, [selectedDate, timestamps]);

	// Reset search when popover closes
	useEffect(() => {
		if (!layerPickerOpen) setLayerSearch("");
	}, [layerPickerOpen]);

	// Focus search input when layer popover opens
	useEffect(() => {
		if (layerPickerOpen) {
			requestAnimationFrame(() => layerSearchRef.current?.focus());
		}
	}, [layerPickerOpen]);

	useEffect(() => {
		if (!isPlaying) {
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
			playIntervalRef.current = null;
			return;
		}
		playIntervalRef.current = setInterval(() => {
			onSelectDate(timestamps[(selectedIdx + 1) % timestamps.length]);
		}, 1200);
		return () => {
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
		};
	}, [isPlaying, selectedIdx, timestamps, onSelectDate]);

	const filteredVariables = useMemo(() => {
		if (!layerSearch.trim()) return variables;
		const q = layerSearch.toLowerCase();
		return variables.filter(
			(v) =>
				v.name.toLowerCase().includes(q) ||
				v.key.toLowerCase().includes(q),
		);
	}, [variables, layerSearch]);

	const handlePrev = () => {
		if (selectedIdx > 0) onSelectDate(timestamps[selectedIdx - 1]);
	};
	const handleNext = () => {
		if (selectedIdx < timestamps.length - 1) onSelectDate(timestamps[selectedIdx + 1]);
	};

	// Select top result on Enter, close on Escape
	const handleLayerSearchKey = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				const top = filteredVariables[0];
				if (top) {
					onSelectVariable(top.variable_id);
					setLayerPickerOpen(false);
				}
			} else if (e.key === "Escape") {
				setLayerPickerOpen(false);
			}
		},
		[filteredVariables, onSelectVariable],
	);

	return (
		<div className="flex flex-1 items-center gap-1.5 min-w-0">
			{/* Layer picker — Popover with search */}
			<Popover open={layerPickerOpen} onOpenChange={setLayerPickerOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="xs"
						className="shrink-0 gap-1 px-1.5 font-semibold uppercase text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
						aria-label="Select layer"
					>
						<Badge
							variant="outline"
							className="pointer-events-none border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
						>
							{variableKey}
						</Badge>
						<ChevronDown
							className={cn(
								"h-3 w-3 transition-transform duration-200",
								layerPickerOpen && "rotate-180",
							)}
						/>
					</Button>
				</PopoverTrigger>
				<PopoverContent side="top" align="start" sideOffset={8} className="w-56 p-0">
					{/* Search */}
					<div className="flex items-center gap-2 border-b border-border px-3 py-2">
						<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<input
							ref={layerSearchRef}
							type="text"
							value={layerSearch}
							onChange={(e) => setLayerSearch(e.target.value)}
							onKeyDown={handleLayerSearchKey}
							placeholder="Search layers…"
							className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
						/>
					</div>
					{/* Results */}
					<ScrollArea className="h-48">
						<div className="p-1">
							{filteredVariables.length === 0 ? (
								<p className="px-3 py-4 text-center text-xs text-muted-foreground">
									No layers found
								</p>
							) : (
								filteredVariables.map((v) => (
									<Item key={v.variable_id} size="xs" asChild>
										<button
											type="button"
											onClick={() => {
												onSelectVariable(v.variable_id);
												setLayerPickerOpen(false);
											}}
											className={cn(
												"w-full cursor-pointer text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
												activeVariableId === v.variable_id &&
													"bg-emerald-50 dark:bg-emerald-900/20",
											)}
										>
											<ItemMedia variant="icon">
												<Layers
													className={cn(
														"h-3.5 w-3.5",
														activeVariableId === v.variable_id
															? "text-emerald-500"
															: "text-muted-foreground",
													)}
												/>
											</ItemMedia>
											<ItemContent>
												<ItemTitle
													className={cn(
														"text-xs",
														activeVariableId === v.variable_id
															? "text-emerald-700 dark:text-emerald-300"
															: "text-foreground",
													)}
												>
													{v.name}
												</ItemTitle>
												<ItemDescription className="text-[10px]">
													{v.key}
												</ItemDescription>
											</ItemContent>
											{activeVariableId === v.variable_id && (
												<span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
											)}
										</button>
									</Item>
								))
							)}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>

			{/* Prev */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={handlePrev}
						disabled={selectedIdx === 0}
						aria-label="Previous date"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Previous date</TooltipContent>
			</Tooltip>

			{/* Play/pause */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={() => setIsPlaying(!isPlaying)}
						aria-label={isPlaying ? "Pause" : "Play"}
						className={cn(
							isPlaying &&
								"text-emerald-600 hover:text-emerald-600 dark:text-emerald-400",
						)}
					>
						{isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					{isPlaying ? "Pause animation" : "Play animation"}
				</TooltipContent>
			</Tooltip>

			{/* Slider */}
			<Slider
				min={0}
				max={timestamps.length - 1}
				step={1}
				value={[selectedIdx]}
				onValueChange={([idx]) => {
					if (idx >= 0 && idx < timestamps.length) onSelectDate(timestamps[idx]);
				}}
				className="min-w-[60px] flex-1 [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
			/>

			{/* Next */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={handleNext}
						disabled={selectedIdx === timestamps.length - 1}
						aria-label="Next date"
					>
						<ChevronRight className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Next date</TooltipContent>
			</Tooltip>

			{/* Date picker — Popover */}
			<Popover
				open={datePickerOpen}
				onOpenChange={(open) => {
					if (open !== datePickerOpen) onToggleDatePicker();
				}}
			>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setLayerPickerOpen(false)}
						className="shrink-0 tabular-nums text-foreground"
						aria-label="Pick a date"
					>
						{selectedDate ? dayjs(selectedDate).format("D MMM YY") : "—"}
					</Button>
				</PopoverTrigger>
				<PopoverContent side="top" align="end" sideOffset={8} className="w-44 p-0">
					<ScrollArea className="h-48">
						<div className="p-1">
							{timestamps.map((ts, idx) => (
								<Item key={ts.getTime()} size="xs" asChild>
									<button
										type="button"
										onClick={() => {
											onSelectDate(ts);
											onToggleDatePicker();
										}}
										className={cn(
											"w-full cursor-pointer text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
											selectedIdx === idx &&
												"bg-emerald-50 dark:bg-emerald-900/20",
										)}
									>
										<ItemContent>
											<ItemTitle
												className={cn(
													"text-[11px] font-normal",
													selectedIdx === idx
														? "font-medium text-emerald-700 dark:text-emerald-300"
														: "text-foreground",
												)}
											>
												{dayjs(ts).format("D MMMM YYYY")}
											</ItemTitle>
										</ItemContent>
										{selectedIdx === idx && (
											<span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
										)}
									</button>
								</Item>
							))}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
});
