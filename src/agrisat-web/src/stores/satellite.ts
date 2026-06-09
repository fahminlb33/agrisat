import { create } from "zustand";
import type {
  TLERecord,
  SatellitePosition,
  GroundTrackPoint,
} from "#/types/satellite";

// -----------------------------------------------------------
// Interfaces
// -----------------------------------------------------------

export interface SatelliteState {
  /** Current TLE records for tracked satellites */
  tles: TLERecord[];
  /** Computed positions (at most one per TLE record) */
  positions: SatellitePosition[];
  /** Currently selected satellite ID, or null if none */
  selectedSatelliteId: string | null;
  /** Ground track for the selected satellite */
  groundTrack: GroundTrackPoint[];
}

export interface SatelliteActions {
  /**
   * Replace all TLE records.
   * Clears selection if the selected satellite's TLE is no longer present.
   * Trims positions to only include satellites still in the new TLE set.
   */
  setSatelliteTLEs(tles: TLERecord[]): void;

  /**
   * Replace all position entries atomically in a single state transition.
   * Ensures positions.length <= tles.length by filtering to known TLE IDs.
   */
  setSatellitePositions(positions: SatellitePosition[]): void;

  /**
   * Select a satellite by ID (or clear selection with null).
   * When selecting, resets ground track to empty array until computation completes.
   */
  setSelectedId(id: string | null): void;

  /**
   * Set the ground track data for the currently selected satellite.
   */
  setGroundTrack(track: GroundTrackPoint[]): void;
}

export type SatelliteStore = SatelliteState & SatelliteActions;

// -----------------------------------------------------------
// Default State
// -----------------------------------------------------------

function getDefaultSatelliteState(): SatelliteState {
  return {
    tles: [],
    positions: [],
    selectedSatelliteId: null,
    groundTrack: [],
  };
}

// -----------------------------------------------------------
// Store
// -----------------------------------------------------------

export const useSatelliteStore = create<SatelliteStore>()((set, get) => ({
  ...getDefaultSatelliteState(),

  setSatelliteTLEs(tles: TLERecord[]) {
    const state = get();
    const tleIds = new Set(tles.map((t) => t.id));

    // Clear selection if selected satellite TLE is no longer present (Req 7.5)
    const selectedSatelliteId =
      state.selectedSatelliteId !== null && !tleIds.has(state.selectedSatelliteId)
        ? null
        : state.selectedSatelliteId;

    // Reset ground track if selection was cleared
    const groundTrack =
      selectedSatelliteId === null && state.selectedSatelliteId !== null
        ? []
        : state.groundTrack;

    // Trim positions to only include satellites still in the TLE set (Req 7.2)
    const positions = state.positions.filter((p) => tleIds.has(p.id));

    set({
      tles,
      positions,
      selectedSatelliteId,
      groundTrack,
    });
  },

  setSatellitePositions(positions: SatellitePosition[]) {
    const state = get();
    const tleIds = new Set(state.tles.map((t) => t.id));

    // Filter to only positions for known TLEs, enforcing positions.length <= tles.length (Req 7.2)
    // Atomic replacement in a single set() call ensures no partial updates (Req 7.3)
    const validPositions = positions.filter((p) => tleIds.has(p.id));

    set({ positions: validPositions });
  },

  setSelectedId(id: string | null) {
    if (id === null) {
      // Clearing selection
      set({ selectedSatelliteId: null, groundTrack: [] });
      return;
    }

    // When selecting, reset ground track to empty until computation completes (Req 7.4)
    set({ selectedSatelliteId: id, groundTrack: [] });
  },

  setGroundTrack(track: GroundTrackPoint[]) {
    set({ groundTrack: track });
  },
}));
