/**
 * Shared TypeScript types for satellite tracking, orbit propagation,
 * and pass prediction.
 *
 * These interfaces define the data models used across the satellite
 * service, Web Worker, Zustand store, and map layer components.
 */

// -----------------------------------------------------------
// Core Data Models
// -----------------------------------------------------------

/** A Two-Line Element record representing satellite orbital parameters. */
export interface TLERecord {
  /** Satellite name or NORAD ID */
  id: string;
  /** TLE line 1 (69 characters, starts with "1") */
  line1: string;
  /** TLE line 2 (69 characters, starts with "2") */
  line2: string;
  /** ISO timestamp of the TLE epoch */
  epoch: string;
  /** ISO timestamp of when this TLE was fetched */
  fetchedAt: string;
}

/** A computed satellite position at a given point in time. */
export interface SatellitePosition {
  /** Satellite identifier */
  id: string;
  /** Satellite display name */
  name: string;
  /** Latitude in degrees, -90 to 90 */
  latitude: number;
  /** Longitude in degrees, -180 to 180 */
  longitude: number;
  /** Altitude in km above Earth's surface */
  altitude: number;
  /** Orbital velocity in km/s */
  velocity: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Whether the satellite is currently in sunlight */
  isInSunlight: boolean;
}

/** A predicted satellite pass over an observer location. */
export interface PassPrediction {
  /** Satellite identifier */
  satelliteId: string;
  /** Satellite display name */
  satelliteName: string;
  /** ISO timestamp when satellite rises above minimum elevation */
  riseTime: string;
  /** Azimuth in degrees (0-360) at rise */
  riseAzimuth: number;
  /** ISO timestamp of maximum elevation */
  maxElevationTime: string;
  /** Maximum elevation in degrees above horizon */
  maxElevation: number;
  /** ISO timestamp when satellite sets below minimum elevation */
  setTime: string;
  /** Azimuth in degrees (0-360) at set */
  setAzimuth: number;
  /** Pass duration in seconds */
  duration: number;
  /** Whether the satellite is in sunlight during the pass */
  isVisible: boolean;
}

/** A single point on a satellite's ground track. */
export interface GroundTrackPoint {
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
  /** Altitude in km */
  altitude: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

// -----------------------------------------------------------
// Worker Message Types
// -----------------------------------------------------------

/** Request to propagate satellite positions at a given timestamp. */
export interface PropagateRequest {
  type: "propagate";
  /** TLE records to propagate */
  tles: TLERecord[];
  /** Target timestamp in Unix milliseconds */
  timestamp: number;
}

/** Response containing computed satellite positions. */
export interface PropagateResponse {
  type: "positions";
  /** Successfully propagated positions */
  positions: SatellitePosition[];
  /** IDs of satellites that failed propagation */
  failed: string[];
}

/** Request to predict passes for a satellite over an observer location. */
export interface PredictPassesRequest {
  type: "predictPasses";
  /** TLE record of the satellite */
  tle: TLERecord;
  /** Observer ground location */
  observer: { lat: number; lng: number; alt: number };
  /** Start of prediction window in Unix milliseconds */
  startTime: number;
  /** End of prediction window in Unix milliseconds */
  endTime: number;
  /** Minimum elevation threshold in degrees */
  minElevation: number;
}

/** Response containing predicted passes. */
export interface PredictPassesResponse {
  type: "passes";
  /** Predicted passes sorted by rise time */
  passes: PassPrediction[];
}

// -----------------------------------------------------------
// Worker Message Unions
// -----------------------------------------------------------

/** All possible messages sent to the propagation worker. */
export type WorkerRequest = PropagateRequest | PredictPassesRequest;

/** All possible messages received from the propagation worker. */
export type WorkerResponse = PropagateResponse | PredictPassesResponse;
