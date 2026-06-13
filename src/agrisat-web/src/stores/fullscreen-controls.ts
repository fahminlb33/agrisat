import { createStore } from "zustand/vanilla";

/**
 * UI control state for the fullscreen map view.
 */

export interface HudSections {
	vegetation: boolean;
	analysis: boolean;
	weather: boolean;
	insights: boolean;
}

export interface FullscreenControlsState {
	// Search
	searchOpen: boolean;

	// Timeline
	selectedDate: Date | null;
	datePickerOpen: boolean;

	// Weather
	weatherExpanded: boolean;

	// AI
	aiPanelOpen: boolean;

	// Zone HUD sections
	hudSections: HudSections;
}

export interface FullscreenControlsActions {
	// Search
	openSearch: () => void;
	closeSearch: () => void;
	toggleSearch: () => void;

	// Timeline
	setSelectedDate: (date: Date | null) => void;
	openDatePicker: () => void;
	closeDatePicker: () => void;
	toggleDatePicker: () => void;

	// Weather
	toggleWeatherExpanded: () => void;
	setWeatherExpanded: (expanded: boolean) => void;

	// AI
	openAiPanel: () => void;
	closeAiPanel: () => void;
	toggleAiPanel: () => void;

	// HUD sections
	toggleHudSection: (section: keyof HudSections) => void;
}

export type FullscreenControlsStore = FullscreenControlsState &
	FullscreenControlsActions;

export function createFullscreenControlsStore() {
	return createStore<FullscreenControlsStore>()((set) => ({
		searchOpen: false,
		selectedDate: null,
		datePickerOpen: false,
		weatherExpanded: false,
		aiPanelOpen: false,
		hudSections: {
			vegetation: false,
			analysis: false,
			weather: false,
			insights: false,
		},

		openSearch: () => set({ searchOpen: true }),
		closeSearch: () => set({ searchOpen: false }),
		toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),

		setSelectedDate: (date) => set({ selectedDate: date }),
		openDatePicker: () => set({ datePickerOpen: true }),
		closeDatePicker: () => set({ datePickerOpen: false }),
		toggleDatePicker: () => set((s) => ({ datePickerOpen: !s.datePickerOpen })),

		toggleWeatherExpanded: () =>
			set((s) => ({ weatherExpanded: !s.weatherExpanded })),
		setWeatherExpanded: (expanded) => set({ weatherExpanded: expanded }),

		openAiPanel: () => set({ aiPanelOpen: true }),
		closeAiPanel: () => set({ aiPanelOpen: false }),
		toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),

		toggleHudSection: (section) =>
			set((s) => ({
				hudSections: {
					...s.hudSections,
					[section]: !s.hudSections[section],
				},
			})),
	}));
}
