import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

import type { Zone as ApiZone, Level as ApiLevel } from "#/services/api";
import { useControls, useQueryContext } from "./ControlProvider";
import { toTitleCase } from "#/lib/strings";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Item,
	ItemContent,
	ItemTitle,
	ItemDescription,
	ItemActions,
} from "#/components/ui/item";
import { cn } from "#/lib/utils";

interface ZoneSearchProps {
	levels: ApiLevel[];
	zones: ApiZone[];
}

export const ZoneSearch = memo(function ZoneSearch({
	levels,
	zones,
}: ZoneSearchProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIdx, setHighlightedIdx] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Store subscriptions
	const zoneId = useQueryContext((s) => s.zoneId);
	const levelId = useQueryContext((s) => s.levelId);
	const setZone = useQueryContext((s) => s.setZone);
	const setLevel = useQueryContext((s) => s.setLevel);

	const searchOpen = useControls((s) => s.searchOpen);
	const openSearch = useControls((s) => s.openSearch);
	const closeSearch = useControls((s) => s.closeSearch);

	const currentZone = useMemo(
		() => (zoneId ? (zones.find((z) => z.zone_id === zoneId) ?? null) : null),
		[zoneId, zones],
	);

	const zonesForLevel = useMemo(
		() =>
			levelId !== null ? zones.filter((z) => z.level_id === levelId) : zones,
		[zones, levelId],
	);

	const filteredZones = useMemo(() => {
		const source = zonesForLevel;
		if (!searchQuery.trim()) return source.slice(0, 12);
		const q = searchQuery.toLowerCase();
		return source
			.filter(
				(z) =>
					z.name.toLowerCase().includes(q) || z.city.toLowerCase().includes(q),
			)
			.slice(0, 12);
	}, [zonesForLevel, searchQuery]);

	// Reset highlight whenever results change
	useEffect(() => {
		setHighlightedIdx(0);
	}, [filteredZones]);

	// Focus input when opened
	useEffect(() => {
		if (searchOpen) {
			requestAnimationFrame(() => inputRef.current?.focus());
		} else {
			setSearchQuery("");
			setHighlightedIdx(0);
		}
	}, [searchOpen]);

	// Scroll highlighted item into view
	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		const item = list.querySelector<HTMLElement>(
			`[data-idx="${highlightedIdx}"]`,
		);
		item?.scrollIntoView({ block: "nearest" });
	}, [highlightedIdx]);

	const handleSelectZone = useCallback(
		(zone: ApiZone) => {
			if (zone.level_id !== levelId) setLevel(zone.level_id);
			setZone(zone.zone_id);
			closeSearch();
		},
		[levelId, setLevel, setZone, closeSearch],
	);

	const handleClose = useCallback(() => {
		closeSearch();
	}, [closeSearch]);

	// Cycle levels with Tab
	const handleTabLevel = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key !== "Tab") return;
			e.preventDefault();
			if (levels.length === 0) return;
			const currentIdx = levels.findIndex((l) => l.level_id === levelId);
			const nextIdx = e.shiftKey
				? (currentIdx - 1 + levels.length) % levels.length
				: (currentIdx + 1) % levels.length;
			setLevel(levels[nextIdx].level_id);
			setZone(null);
		},
		[levels, levelId, setLevel, setZone],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			switch (e.key) {
				case "Tab":
					handleTabLevel(e);
					break;
				case "ArrowDown":
					e.preventDefault();
					setHighlightedIdx((i) => Math.min(i + 1, filteredZones.length - 1));
					break;
				case "ArrowUp":
					e.preventDefault();
					setHighlightedIdx((i) => Math.max(i - 1, 0));
					break;
				case "Enter": {
					const zone = filteredZones[highlightedIdx];
					if (zone) handleSelectZone(zone);
					break;
				}
				case "Escape":
					handleClose();
					break;
			}
		},
		[
			filteredZones,
			highlightedIdx,
			handleSelectZone,
			handleClose,
			handleTabLevel,
		],
	);

	return (
		<>
			{/* Click-outside backdrop — sits above the map but below the search panel */}
			{searchOpen && (
				<div className="fixed inset-0 z-10" onClick={handleClose} />
			)}
			<div className="absolute top-16 sm:top-4 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 px-4">
				<div className="relative">
					{/* Collapsed pill */}
					{!searchOpen && (
						<button
							type="button"
							onClick={openSearch}
							className="flex w-full items-center gap-2 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl"
						>
							<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">
								{currentZone
									? `${toTitleCase(levels.find((l) => l.level_id === currentZone.level_id)?.level) ?? ""} · ${currentZone.name}`
									: "Search zones…"}
							</span>
						</button>
					)}

					{/* Expanded panel */}
					{searchOpen && (
						<div className="rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 animate-in fade-in zoom-in-95 duration-150">
							{/* Level tabs */}
							{levels.length > 0 && (
								<div className="flex items-center gap-1 border-b border-border px-2 pt-2 pb-1.5">
									{levels.map((level) => (
										<button
											key={level.level_id}
											type="button"
											onClick={() => {
												setLevel(level.level_id);
												setZone(null);
												inputRef.current?.focus();
											}}
											className={cn(
												"relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150",
												levelId === level.level_id
													? "text-emerald-700 dark:text-emerald-300"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{levelId === level.level_id && (
												<span className="absolute inset-0 rounded-lg bg-emerald-100 animate-in fade-in zoom-in-95 duration-150 dark:bg-emerald-900/40" />
											)}
											<span className="relative z-10">{level.level}</span>
										</button>
									))}
									{/* Tab hint */}
									<span className="ml-auto mr-1 text-[10px] text-muted-foreground/60 select-none">
										Tab to switch
									</span>
								</div>
							)}

							{/* Search input row */}
							<div className="flex items-center gap-2 px-3 py-1.5">
								<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
								<input
									ref={inputRef}
									type="text"
									placeholder={
										levelId
											? `Search ${levels.find((l) => l.level_id === levelId)?.level ?? "zones"}…`
											: "Search zones…"
									}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									onKeyDown={handleKeyDown}
									className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
								/>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={handleClose}
									aria-label="Close search"
								>
									<X className="h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					)}

					{/* Results dropdown */}
					{searchOpen && (
						<div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
							<ScrollArea className="h-72">
								<div className="p-1" ref={listRef}>
									{filteredZones.length === 0 ? (
										<p className="px-4 py-4 text-center text-xs text-muted-foreground">
											No zones found
										</p>
									) : (
										filteredZones.map((zone, idx) => (
											<Item key={zone.zone_id} asChild>
												<button
													type="button"
													data-idx={idx}
													onClick={() => handleSelectZone(zone)}
													className={cn(
														"w-full cursor-pointer text-left transition-colors focus-visible:outline-none",
														idx === highlightedIdx
															? "bg-muted"
															: "hover:bg-muted",
														zoneId === zone.zone_id &&
															"bg-emerald-50 dark:bg-emerald-900/20",
													)}
												>
													<MapPin
														className={cn(
															"h-4 w-4 shrink-0 transition-colors",
															zoneId === zone.zone_id
																? "text-emerald-600"
																: "text-emerald-400",
														)}
													/>
													<ItemContent>
														<ItemTitle className="text-sm">
															{zone.name}
														</ItemTitle>
														<ItemDescription>
															{zone.city} · {(zone.area / 1_000_000).toFixed(2)}{" "}
															km²
														</ItemDescription>
													</ItemContent>
													<ItemActions>
														<Badge
															variant="outline"
															className="capitalize text-muted-foreground"
														>
															{levels.find((l) => l.level_id === zone.level_id)
																?.level ?? ""}
														</Badge>
													</ItemActions>
												</button>
											</Item>
										))
									)}
								</div>
							</ScrollArea>
							{filteredZones.length > 0 && (
								<div className="border-t border-border px-3 py-1.5">
									<p className="text-[10px] text-muted-foreground/60">
										↑↓ navigate · Enter select · Esc close · Tab switch level
									</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</>
	);
});
