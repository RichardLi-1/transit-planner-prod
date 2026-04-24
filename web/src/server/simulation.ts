/**
 * Self-contained transit simulation engine.
 *
 * Agents are assigned a persona (worker, student, senior, shift_worker, parent)
 * and generate a full day of trip legs (commute + optional activities).
 * The caller specifies a timeRange {startMin, endMin} to filter which legs
 * are shown in the animation and per-agent output.
 */
import "server-only";

import { ROUTES, BUS_ROUTES } from "~/app/map/transit-data";
import type { Route } from "~/app/map/transit-data";
import { supabase } from "./supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

const WALK_TRANSFER_M = 400;
const ACCESS_WALK_M   = 800;
const WALK_SPEED_MPS  = 5 / 3.6;

// ── Persona & purpose types ───────────────────────────────────────────────────

export type Persona     = "worker" | "student" | "senior" | "shift_worker" | "parent";
export type TripPurpose = "commute" | "lunch" | "shopping" | "social" | "medical" | "errand" | "return";

// ── Peak periods ──────────────────────────────────────────────────────────────

const PEAK_PERIODS = {
  morningStart:  420,
  morningEnd:    570,
  eveningStart:  990,
  eveningEnd:   1140,
} as const;

function congestionMultiplierAt(departureMin: number): number {
  const { morningStart, morningEnd, eveningStart, eveningEnd } = PEAK_PERIODS;
  const RAMP = 30;
  const PEAK_MULT = 0.55;
  if ((departureMin >= morningStart && departureMin <= morningEnd) ||
      (departureMin >= eveningStart && departureMin <= eveningEnd)) return PEAK_MULT;
  if (departureMin >= morningStart - RAMP && departureMin < morningStart)
    return 1.0 - (1.0 - PEAK_MULT) * (departureMin - (morningStart - RAMP)) / RAMP;
  if (departureMin > morningEnd && departureMin <= morningEnd + RAMP)
    return PEAK_MULT + (1.0 - PEAK_MULT) * (departureMin - morningEnd) / RAMP;
  if (departureMin >= eveningStart - RAMP && departureMin < eveningStart)
    return 1.0 - (1.0 - PEAK_MULT) * (departureMin - (eveningStart - RAMP)) / RAMP;
  if (departureMin > eveningEnd && departureMin <= eveningEnd + RAMP)
    return PEAK_MULT + (1.0 - PEAK_MULT) * (departureMin - eveningEnd) / RAMP;
  return 1.0;
}

function sampleNormal(rand: () => number, mean: number, sd: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand();
  return mean + ((s - 3) / 0.7071) * sd;
}

function clampNormal(rand: () => number, mean: number, sd: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, sampleNormal(rand, mean, sd))));
}

// ── Car speed zones ───────────────────────────────────────────────────────────

const CAR_SPEED_ZONES: { maxDistM: number; speedKmh: number }[] = [
  { maxDistM:  3_000, speedKmh: 20 },
  { maxDistM:  8_000, speedKmh: 28 },
  { maxDistM: 15_000, speedKmh: 35 },
  { maxDistM: Infinity, speedKmh: 45 },
];
const DOWNTOWN_LON = -79.382;
const DOWNTOWN_LAT =  43.649;

// ── Transit speeds ────────────────────────────────────────────────────────────

// These defaults are mirrored in web/src/app/api/transit-speeds/route.ts — keep in sync.
const SPEED: Record<Route["type"], number> = {
  subway:    35,
  lrt:       25,
  streetcar: 15,
  bus:       20,
  go_train:  60,
};

// Half-headway model: penalty = min(headway/2, cap). These match transit-speeds fallbacks.
const BOARD_PENALTY: Record<Route["type"], number> = {
  subway:    2,
  lrt:       2.5,
  streetcar: 3,
  bus:       4,
  go_train:  5,
};

// ── Destination clusters ──────────────────────────────────────────────────────

const WORK_CLUSTERS: { name: string; lon: number; lat: number; weight: number }[] = [
  { name: "Union / Financial District", lon: -79.381, lat: 43.645, weight: 0.22 },
  { name: "King West / Entertainment",  lon: -79.396, lat: 43.644, weight: 0.12 },
  { name: "Queen / City Hall",          lon: -79.384, lat: 43.652, weight: 0.10 },
  { name: "Hospital Row",               lon: -79.392, lat: 43.658, weight: 0.07 },
  { name: "Yonge & Bloor",             lon: -79.385, lat: 43.671, weight: 0.07 },
  { name: "Liberty Village",            lon: -79.420, lat: 43.638, weight: 0.05 },
  { name: "Midtown Yonge/Eg",          lon: -79.398, lat: 43.705, weight: 0.05 },
  { name: "North York Centre",          lon: -79.411, lat: 43.761, weight: 0.05 },
  { name: "Scarborough TC",             lon: -79.259, lat: 43.774, weight: 0.04 },
  { name: "Etobicoke Centre",           lon: -79.548, lat: 43.644, weight: 0.04 },
  { name: "Pearson / Airport",          lon: -79.616, lat: 43.677, weight: 0.03 },
  { name: "East Danforth",              lon: -79.330, lat: 43.680, weight: 0.03 },
  { name: "Local (same area)",          lon: null as unknown as number, lat: null as unknown as number, weight: 0.13 },
];

const SCHOOL_CLUSTERS: { name: string; lon: number; lat: number }[] = [
  { name: "University of Toronto",    lon: -79.397, lat: 43.665 },
  { name: "Toronto Metropolitan Univ",lon: -79.379, lat: 43.658 },
  { name: "York University",          lon: -79.502, lat: 43.773 },
  { name: "OCAD University",          lon: -79.391, lat: 43.653 },
  { name: "George Brown College",     lon: -79.375, lat: 43.648 },
  { name: "Humber College North",     lon: -79.608, lat: 43.729 },
  { name: "Centennial College",       lon: -79.244, lat: 43.784 },
  { name: "Seneca College Newnham",   lon: -79.352, lat: 43.796 },
];

const DEST_POOLS: Record<string, { name: string; lon: number; lat: number }[]> = {
  food_market: [
    { name: "St. Lawrence Market",  lon: -79.371, lat: 43.648 },
    { name: "Kensington Market",    lon: -79.402, lat: 43.655 },
    { name: "Chinatown",            lon: -79.399, lat: 43.653 },
    { name: "Little Italy",         lon: -79.414, lat: 43.655 },
    { name: "Distillery District",  lon: -79.359, lat: 43.650 },
    { name: "Danforth Village",     lon: -79.325, lat: 43.678 },
    { name: "Bloor West Village",   lon: -79.468, lat: 43.651 },
  ],
  shopping: [
    { name: "Eaton Centre",         lon: -79.380, lat: 43.654 },
    { name: "Yorkdale Mall",        lon: -79.451, lat: 43.725 },
    { name: "Scarborough TC",       lon: -79.259, lat: 43.775 },
    { name: "Fairview Mall",        lon: -79.331, lat: 43.778 },
    { name: "Sherway Gardens",      lon: -79.566, lat: 43.614 },
    { name: "Square One",           lon: -79.644, lat: 43.593 },
  ],
  entertainment: [
    { name: "King West",            lon: -79.400, lat: 43.644 },
    { name: "Distillery District",  lon: -79.359, lat: 43.650 },
    { name: "Ossington Strip",      lon: -79.425, lat: 43.649 },
    { name: "Bloor West Village",   lon: -79.468, lat: 43.651 },
    { name: "The Danforth",         lon: -79.325, lat: 43.678 },
    { name: "Kensington Market",    lon: -79.402, lat: 43.655 },
    { name: "College Street",       lon: -79.415, lat: 43.655 },
  ],
  park: [
    { name: "High Park",            lon: -79.464, lat: 43.647 },
    { name: "Riverdale Park",       lon: -79.350, lat: 43.670 },
    { name: "Trinity Bellwoods",    lon: -79.416, lat: 43.648 },
    { name: "Centennial Park",      lon: -79.568, lat: 43.644 },
    { name: "Rouge Park",           lon: -79.158, lat: 43.814 },
    { name: "Tommy Thompson",       lon: -79.328, lat: 43.636 },
  ],
  medical: [
    { name: "Toronto General",      lon: -79.388, lat: 43.659 },
    { name: "Sunnybrook Hospital",  lon: -79.375, lat: 43.723 },
    { name: "St Michael's Hospital",lon: -79.376, lat: 43.652 },
    { name: "Scarborough Health",   lon: -79.244, lat: 43.781 },
    { name: "Humber River Hospital",lon: -79.527, lat: 43.747 },
  ],
};

// ── Day profile types & default ───────────────────────────────────────────────

interface DayProfileEntry {
  probability: number;
  departure: { mean: number; sd: number };
  destPool: string;
  socialPull: number;   // 0=prefer nearby, 1=go anywhere
  anchor: "home" | "work";
  durationMin: { mean: number; sd: number };
  purpose: TripPurpose;
}

type DayProfile = Partial<Record<Persona, Record<string, DayProfileEntry>>>;

const DEFAULT_DAY_PROFILE: Required<DayProfile> = {
  worker: {
    lunch_local:    { probability: 0.50, departure: { mean: 720,  sd: 20 }, destPool: "nearby",        socialPull: 0.10, anchor: "work", durationMin: { mean: 45,  sd: 10 }, purpose: "lunch"    },
    lunch_out:      { probability: 0.25, departure: { mean: 720,  sd: 25 }, destPool: "food_market",   socialPull: 0.45, anchor: "work", durationMin: { mean: 70,  sd: 15 }, purpose: "lunch"    },
    evening_shop:   { probability: 0.20, departure: { mean: 1050, sd: 45 }, destPool: "shopping",      socialPull: 0.25, anchor: "work", durationMin: { mean: 60,  sd: 20 }, purpose: "shopping" },
    evening_social: { probability: 0.15, departure: { mean: 1170, sd: 60 }, destPool: "entertainment", socialPull: 0.55, anchor: "home", durationMin: { mean: 120, sd: 30 }, purpose: "social"   },
  },
  student: {
    lunch:          { probability: 0.60, departure: { mean: 750,  sd: 30 }, destPool: "food_market",   socialPull: 0.30, anchor: "work", durationMin: { mean: 60,  sd: 20 }, purpose: "lunch"    },
    social_aft:     { probability: 0.40, departure: { mean: 960,  sd: 60 }, destPool: "entertainment", socialPull: 0.55, anchor: "work", durationMin: { mean: 90,  sd: 30 }, purpose: "social"   },
    evening_out:    { probability: 0.30, departure: { mean: 1140, sd: 60 }, destPool: "entertainment", socialPull: 0.65, anchor: "home", durationMin: { mean: 120, sd: 40 }, purpose: "social"   },
  },
  senior: {
    morning_errand: { probability: 0.50, departure: { mean: 630,  sd: 30 }, destPool: "food_market",   socialPull: 0.20, anchor: "home", durationMin: { mean: 60,  sd: 20 }, purpose: "errand"   },
    morning_med:    { probability: 0.25, departure: { mean: 600,  sd: 45 }, destPool: "medical",       socialPull: 0.15, anchor: "home", durationMin: { mean: 90,  sd: 20 }, purpose: "medical"  },
    aft_social:     { probability: 0.35, departure: { mean: 840,  sd: 60 }, destPool: "park",          socialPull: 0.20, anchor: "home", durationMin: { mean: 90,  sd: 30 }, purpose: "social"   },
  },
  shift_worker: {
    errand:         { probability: 0.40, departure: { mean: 900,  sd: 60 }, destPool: "food_market",   socialPull: 0.25, anchor: "home", durationMin: { mean: 45,  sd: 15 }, purpose: "errand"   },
  },
  parent: {
    evening_shop:   { probability: 0.35, departure: { mean: 1020, sd: 30 }, destPool: "shopping",      socialPull: 0.15, anchor: "work", durationMin: { mean: 45,  sd: 15 }, purpose: "shopping" },
    evening_social: { probability: 0.20, departure: { mean: 1080, sd: 60 }, destPool: "entertainment", socialPull: 0.30, anchor: "home", durationMin: { mean: 90,  sd: 30 }, purpose: "social"   },
  },
};

// ── Graph types ───────────────────────────────────────────────────────────────

interface AgentLeg {
  purpose: TripPurpose;
  departureMin: number;
  originLon: number;
  originLat: number;
  destLon: number;
  destLat: number;
}

interface GraphStop {
  id: number;
  name: string;
  lon: number;
  lat: number;
  routeId: string;
  routeType: Route["type"];
}

interface GraphEdge {
  to: number;
  weight: number;
  kind: "transit" | "walk" | "proposed";
  routeName: string;
  fromLon: number; fromLat: number;
  toLon: number;   toLat: number;
  fromName: string;
  toName: string;
}

type Graph = Map<number, GraphEdge[]>;

// ── Public-facing types ───────────────────────────────────────────────────────

export interface SimAgent {
  id: number;
  homeLon: number;
  homeLat: number;
  workLon: number;
  workLat: number;
  income: "low" | "mid" | "high";
  transitDep: number;
  workCluster: string;
  persona: Persona;
  legs: AgentLeg[];
}

interface EdgeRecord {
  fromName: string; toName: string;
  fromLon: number; fromLat: number;
  toLon: number;   toLat: number;
  kind: string; routeName: string;
}

interface LegRouteResult {
  agentId: number;
  legIndex: number;
  purpose: TripPurpose;
  departureMin: number;
  feasible: boolean;
  totalMin: number;
  transitMin: number;
  carMin: number;
  transfers: number;
  pathIds: number[];
  edgesUsed: EdgeRecord[];
  homeLon: number; homeLat: number;
  income: "low" | "mid" | "high";
  transitDep: number;
  persona: Persona;
}

export interface ProposedLineStop { name: string; coords: [number, number] }
export interface ProposedLine { name: string; type: string; stops: ProposedLineStop[] }

export interface TransitSpeedData {
  speeds: Record<Route["type"], number>;
  boardingPenalties: Record<Route["type"], number>;
  liveHeadways: Record<Route["type"], number | null>;
  routeCounts: Record<Route["type"], number>;
  roadMultiplier: number;
  timePeriod: string;
  isLive: boolean;
  source: "live" | "fallback";
  updatedAt: number;
  tripCount: number;
}

export interface SimulationResult {
  hasProposedLines: boolean;
  agentCount: number;
  animatedAgentCount: number;
  runDurationS: number;
  timeRange: { startMin: number; endMin: number };
  baseline: RunStats;
  scenario: RunStats;
  delta: DeltaStats;
  equity: { baselineScore: number; scenarioScore: number };
  lineStress: StressSegment[];
  baselineEdgeStress: StressSegment[];
  perAgent: PerAgentDelta[];
  graphStats: { nodes: number; edges: number; scenarioNodes: number; scenarioEdges: number };
  transitSpeedSource:   "live" | "fallback";
  transitUpdatedAt:     number | null;
  transitTripCount:     number;
  transitRoadMultiplier: number;
}

export interface StressSegment {
  lineName: string;
  fromStop: string;
  toStop: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  agentTrips: number;
  baselineTrips: number;
  stressPct: number;
  deltaPct: number;
}

interface RunStats {
  pctAccessible: number;
  avgTransitMin: number;
  medianTransitMin: number;
  p90TransitMin: number;
  avgTotalMin: number;
  avgTransfers: number;
  avgCarMin: number;
  incomeBreakdown: Record<string, number>;
}

interface DeltaStats {
  timeSavedMin: number;
  totalTimeSavedMin: number;
  accessibilityGainPct: number;
  transferReduction: number;
  equityImprovement: number;
  newlyAccessibleAgents: number;
}

interface PerAgentDelta {
  agentId: number;
  homeLon: number; homeLat: number;
  income: string;
  transitDep: number;
  persona: Persona;
  purpose: TripPurpose;
  departureMin: number;
  baselineTime: number;
  scenarioTime: number;
  timeSavedMin: number;
  newlyAccessible: boolean;
  pathCoords: [number, number][];
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function walkMin(distM: number): number {
  return distM / WALK_SPEED_MPS / 60;
}

function carTravelMin(originLon: number, originLat: number, destLon: number, destLat: number): number {
  const totalDistM = haversineM(originLon, originLat, destLon, destLat);
  if (totalDistM < 1) return 0;
  const STEPS = 10;
  let totalMin = 0;
  const segDistM = totalDistM / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const t = (i + 0.5) / STEPS;
    const lon = originLon + t * (destLon - originLon);
    const lat = originLat + t * (destLat - originLat);
    const distFromCore = haversineM(lon, lat, DOWNTOWN_LON, DOWNTOWN_LAT);
    const zone = CAR_SPEED_ZONES.find((z) => distFromCore <= z.maxDistM)!;
    totalMin += (segDistM / 1000 / zone.speedKmh) * 60;
  }
  return +totalMin.toFixed(2);
}

// ── Graph construction ────────────────────────────────────────────────────────

function buildGraph(
  extra: ProposedLine[] = [],
  speeds: Record<string, number> = SPEED,
  penalties: Record<string, number> = BOARD_PENALTY,
): { graph: Graph; stops: Map<number, GraphStop> } {
  const stopMap = new Map<number, GraphStop>();
  const graph: Graph = new Map();
  let nextId = 1;
  const nameToId = new Map<string, number>();

  function getOrAddStop(name: string, lon: number, lat: number, routeId: string, routeType: Route["type"]): number {
    const existing = nameToId.get(name);
    if (existing !== undefined) return existing;
    const id = nextId++;
    nameToId.set(name, id);
    stopMap.set(id, { id, name, lon, lat, routeId, routeType });
    graph.set(id, []);
    return id;
  }

  function addEdge(from: number, to: number, distM: number, speed: number, penalty: number, kind: GraphEdge["kind"], routeName: string) {
    const fromStop = stopMap.get(from)!;
    const toStop   = stopMap.get(to)!;
    const timeMin  = (distM / 1000 / speed) * 60 + (kind === "transit" || kind === "proposed" ? penalty : 0);
    graph.get(from)!.push({
      to, weight: timeMin, kind, routeName,
      fromLon: fromStop.lon, fromLat: fromStop.lat,
      toLon:   toStop.lon,   toLat:   toStop.lat,
      fromName: fromStop.name, toName: toStop.name,
    });
  }

  const allRoutes: Route[] = [
    ...ROUTES.filter((r) => r.type === "subway" || r.type === "lrt"),
    ...ROUTES.filter((r) => r.type === "streetcar"),
    ...BUS_ROUTES,
  ];

  for (const route of allRoutes) {
    const speed   = speeds[route.type] ?? 22;
    const penalty = penalties[route.type] ?? 4;
    const ids: number[] = route.stops.map((s) =>
      getOrAddStop(s.name, s.coords[0], s.coords[1], route.id, route.type)
    );
    for (let i = 0; i < ids.length - 1; i++) {
      const from = ids[i]!;
      const to   = ids[i + 1]!;
      const fromS = stopMap.get(from)!;
      const toS   = stopMap.get(to)!;
      const dist  = haversineM(fromS.lon, fromS.lat, toS.lon, toS.lat);
      addEdge(from, to, dist, speed, penalty, "transit", route.name);
      addEdge(to, from, dist, speed, penalty, "transit", route.name);
    }
  }

  const stopList = Array.from(stopMap.values());
  const tile = new Map<string, GraphStop[]>();
  for (const s of stopList) {
    const key = `${Math.floor(s.lon * 100)},${Math.floor(s.lat * 100)}`;
    if (!tile.has(key)) tile.set(key, []);
    tile.get(key)!.push(s);
  }
  for (const s of stopList) {
    const cx = Math.floor(s.lon * 100);
    const cy = Math.floor(s.lat * 100);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbours = tile.get(`${cx + dx},${cy + dy}`) ?? [];
        for (const t of neighbours) {
          if (t.id === s.id || t.routeId === s.routeId) continue;
          const d = haversineM(s.lon, s.lat, t.lon, t.lat);
          if (d <= WALK_TRANSFER_M) {
            const wt = walkMin(d);
            const existing = graph.get(s.id)!.find((e) => e.to === t.id);
            if (!existing || existing.weight > wt) {
              if (existing) graph.get(s.id)!.splice(graph.get(s.id)!.indexOf(existing), 1);
              graph.get(s.id)!.push({
                to: t.id, weight: wt, kind: "walk", routeName: "walk",
                fromLon: s.lon, fromLat: s.lat, toLon: t.lon, toLat: t.lat,
                fromName: s.name, toName: t.name,
              });
            }
          }
        }
      }
    }
  }

  let virtualId = -1;
  for (const line of extra) {
    const speed   = speeds[line.type] ?? 22;
    const penalty = penalties[line.type] ?? 4;
    let prevId: number | null = null;

    for (const stop of line.stops) {
      const [lon, lat] = stop.coords;
      const id = virtualId--;
      stopMap.set(id, { id, name: stop.name, lon, lat, routeId: `proposed-${line.name}`, routeType: (line.type as Route["type"]) ?? "bus" });
      graph.set(id, []);

      for (const rs of stopList) {
        const d = haversineM(lon, lat, rs.lon, rs.lat);
        if (d <= WALK_TRANSFER_M) {
          const wt = walkMin(d);
          graph.get(id)!.push({ to: rs.id, weight: wt, kind: "walk", routeName: "walk", fromLon: lon, fromLat: lat, toLon: rs.lon, toLat: rs.lat, fromName: stop.name, toName: rs.name });
          graph.get(rs.id)!.push({ to: id, weight: wt, kind: "walk", routeName: "walk", fromLon: rs.lon, fromLat: rs.lat, toLon: lon, toLat: lat, fromName: rs.name, toName: stop.name });
        }
      }

      if (prevId !== null) {
        const prev = stopMap.get(prevId)!;
        const dist = haversineM(prev.lon, prev.lat, lon, lat);
        const tt   = (dist / 1000 / speed) * 60 + penalty;
        graph.get(prevId)!.push({ to: id, weight: tt, kind: "proposed", routeName: line.name, fromLon: prev.lon, fromLat: prev.lat, toLon: lon, toLat: lat, fromName: prev.name, toName: stop.name });
        graph.get(id)!.push({ to: prevId, weight: tt, kind: "proposed", routeName: line.name, fromLon: lon, fromLat: lat, toLon: prev.lon, toLat: prev.lat, fromName: stop.name, toName: prev.name });
      }
      prevId = id;
    }
  }

  return { graph, stops: stopMap };
}

// ── Dijkstra ──────────────────────────────────────────────────────────────────

type HeapItem = [number, number];

class MinHeap {
  private data: HeapItem[] = [];
  get size(): number { return this.data.length; }
  push(item: HeapItem): void {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop(): HeapItem | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) { this.data[0] = last; this._siftDown(0); }
    return top;
  }
  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent]![0] <= this.data[i]![0]) break;
      [this.data[parent], this.data[i]] = [this.data[i]!, this.data[parent]!];
      i = parent;
    }
  }
  private _siftDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l]![0] < this.data[smallest]![0]) smallest = l;
      if (r < n && this.data[r]![0] < this.data[smallest]![0]) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i]!, this.data[smallest]!];
      i = smallest;
    }
  }
}

function dijkstra(graph: Graph, src: number, dst: number): { dist: number; path: number[] } | null {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  dist.set(src, 0);
  heap.push([0, src]);
  while (heap.size > 0) {
    const [cost, u] = heap.pop()!;
    if (u === dst) {
      const path: number[] = [];
      let cur: number | undefined = dst;
      while (cur !== undefined) { path.unshift(cur); cur = prev.get(cur); }
      return { dist: cost, path };
    }
    if (cost > (dist.get(u) ?? Infinity)) continue;
    for (const edge of graph.get(u) ?? []) {
      const newCost = cost + edge.weight;
      if (newCost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newCost);
        prev.set(edge.to, u);
        heap.push([newCost, edge.to]);
      }
    }
  }
  return null;
}

// ── Nearest stop ──────────────────────────────────────────────────────────────

function findNearestStop(lon: number, lat: number, maxM: number, stops: Map<number, GraphStop>): { id: number; distM: number } | null {
  let best: { id: number; distM: number } | null = null;
  for (const s of stops.values()) {
    if (s.id < 0) continue;
    const d = haversineM(lon, lat, s.lon, s.lat);
    if (d <= maxM && (!best || d < best.distM)) best = { id: s.id, distM: d };
  }
  return best;
}

// ── PRNG helpers ──────────────────────────────────────────────────────────────

function makePrng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function weightedChoice<T extends { weight: number }>(items: T[], rand: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const item of items) { r -= item.weight; if (r <= 0) return item; }
  return items[items.length - 1]!;
}

// ── Destination picking ───────────────────────────────────────────────────────

function pickDestination(
  poolName: string, anchorLon: number, anchorLat: number,
  socialPull: number, rand: () => number,
): { lon: number; lat: number; name: string } {
  if (poolName === "nearby") {
    return { lon: anchorLon + (rand() - 0.5) * 0.008, lat: anchorLat + (rand() - 0.5) * 0.008, name: "Nearby" };
  }
  const pool = DEST_POOLS[poolName];
  if (!pool?.length) {
    return { lon: anchorLon + (rand() - 0.5) * 0.008, lat: anchorLat + (rand() - 0.5) * 0.008, name: "Nearby" };
  }
  // Higher socialPull → weaker distance decay → more willing to travel far
  const weights = pool.map((p) => {
    const distKm = Math.max(0.5, haversineM(anchorLon, anchorLat, p.lon, p.lat) / 1000);
    const exponent = 2 * (1 - socialPull); // 0=uniform, 2=strong nearby bias
    return 1 / Math.pow(distKm, exponent);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]!; if (r <= 0) return pool[i]!; }
  return pool[pool.length - 1]!;
}

// ── Trip chain builder ────────────────────────────────────────────────────────

function buildLegChain(
  persona: Persona,
  homeLon: number, homeLat: number,
  workLon: number, workLat: number,
  profile: DayProfile,
  rand: () => number,
): AgentLeg[] {
  const legs: AgentLeg[] = [];
  const isEarlyShift = persona === "shift_worker" && rand() < 0.5;

  // Morning commute
  const morningMean =
    persona === "senior"       ? 570  // 9:30am
    : isEarlyShift             ? 330  // 5:30am
    : persona === "shift_worker" ? 810 // 1:30pm
    : persona === "parent"     ? 450  // 7:30am
    : persona === "student"    ? 510  // 8:30am
    :                            480; // 8:00am (worker default)

  legs.push({
    purpose: "commute",
    departureMin: clampNormal(rand, morningMean, 25, 240, 900),
    originLon: homeLon, originLat: homeLat,
    destLon: workLon,   destLat: workLat,
  });

  // Optional activity legs
  for (const entry of Object.values(profile[persona] ?? {})) {
    if (rand() > entry.probability) continue;
    const depMin = clampNormal(rand, entry.departure.mean, entry.departure.sd, 240, 1380);
    const [oLon, oLat] = entry.anchor === "home" ? [homeLon, homeLat] : [workLon, workLat];
    const dest = pickDestination(entry.destPool, oLon, oLat, entry.socialPull, rand);
    const dur  = clampNormal(rand, entry.durationMin.mean, entry.durationMin.sd, 15, 300);

    legs.push({ purpose: entry.purpose, departureMin: depMin, originLon: oLon, originLat: oLat, destLon: dest.lon, destLat: dest.lat });
    legs.push({ purpose: "return", departureMin: depMin + dur, originLon: dest.lon, originLat: dest.lat, destLon: oLon, destLat: oLat });
  }

  // Evening commute
  const eveningMean =
    persona === "senior"       ? 750   // 12:30pm
    : isEarlyShift             ? 810   // 1:30pm
    : persona === "shift_worker" ? 1350 // 10:30pm
    : persona === "student"    ? 960   // 4:00pm
    : persona === "parent"     ? 960   // 4:00pm
    :                            1020; // 5:00pm (worker default)

  legs.push({
    purpose: "commute",
    departureMin: clampNormal(rand, eveningMean, 30, 600, 1440),
    originLon: workLon, originLat: workLat,
    destLon: homeLon,   destLat: homeLat,
  });

  return legs.sort((a, b) => a.departureMin - b.departureMin);
}

function generateDayProfile(_seed: number): DayProfile {
  return DEFAULT_DAY_PROFILE;
}

// ── Population loading ────────────────────────────────────────────────────────

async function loadPopulationPoints(): Promise<{ lon: number; lat: number; weight: number }[]> {
  const { data, error } = await supabase
    .from("pop_data")
    .select("longitude, latitude, population")
    .gte("latitude", 43.4).lte("latitude", 43.9)
    .gte("longitude", -79.7).lte("longitude", -79.1)
    .gt("population", 0)
    .order("population", { ascending: false })
    .limit(5000);

  if (error || !data?.length) {
    return [
      { lon: -79.382, lat: 43.649, weight: 10 },
      { lon: -79.420, lat: 43.668, weight:  8 },
      { lon: -79.450, lat: 43.655, weight:  7 },
      { lon: -79.350, lat: 43.690, weight:  9 },
      { lon: -79.310, lat: 43.710, weight:  8 },
      { lon: -79.260, lat: 43.770, weight:  6 },
      { lon: -79.540, lat: 43.645, weight:  5 },
      { lon: -79.410, lat: 43.760, weight:  7 },
      { lon: -79.480, lat: 43.700, weight:  5 },
      { lon: -79.390, lat: 43.720, weight:  6 },
    ];
  }

  return (data as { longitude: number; latitude: number; population: number }[]).map((r) => ({
    lon: r.longitude, lat: r.latitude, weight: r.population,
  }));
}

// ── Agent generation ──────────────────────────────────────────────────────────

export async function generateAgents(n: number, seed: number, dayProfile: DayProfile): Promise<SimAgent[]> {
  const rand = makePrng(seed);
  const popPoints = await loadPopulationPoints();

  function incomeFor(lon: number, lat: number): { income: SimAgent["income"]; transitDep: number } {
    const d = haversineM(lon, lat, DOWNTOWN_LON, DOWNTOWN_LAT);
    if (d < 3000)  return { income: "low",  transitDep: 0.85 + rand() * 0.1 };
    if (d < 8000)  return { income: "mid",  transitDep: 0.5  + rand() * 0.2 };
    if (d < 15000) return { income: "mid",  transitDep: 0.35 + rand() * 0.2 };
    const r = rand();
    if (r < 0.35)  return { income: "low",  transitDep: 0.6  + rand() * 0.15 };
    if (r < 0.7)   return { income: "mid",  transitDep: 0.3  + rand() * 0.2 };
    return          { income: "high", transitDep: 0.1  + rand() * 0.15 };
  }

  function personaFor(distFromCoreM: number): Persona {
    const r = rand();
    if (distFromCoreM < 5000) {
      if (r < 0.45) return "worker";
      if (r < 0.65) return "student";
      if (r < 0.80) return "senior";
      if (r < 0.90) return "parent";
      return "shift_worker";
    } else if (distFromCoreM < 15000) {
      if (r < 0.50) return "worker";
      if (r < 0.62) return "student";
      if (r < 0.73) return "senior";
      if (r < 0.88) return "parent";
      return "shift_worker";
    } else {
      if (r < 0.45) return "worker";
      if (r < 0.52) return "student";
      if (r < 0.62) return "senior";
      if (r < 0.82) return "parent";
      return "shift_worker";
    }
  }

  const agents: SimAgent[] = [];
  for (let i = 0; i < n; i++) {
    const pt = weightedChoice(popPoints, rand);
    const distFromCore = haversineM(pt.lon, pt.lat, DOWNTOWN_LON, DOWNTOWN_LAT);
    const jitterDeg = 0.0015 + (distFromCore / 30_000) * 0.004;
    const homeLon = pt.lon + (rand() - 0.5) * jitterDeg;
    const homeLat = pt.lat + (rand() - 0.5) * jitterDeg;
    const { income, transitDep } = incomeFor(homeLon, homeLat);
    const persona = personaFor(distFromCore);

    let workLon: number, workLat: number, workCluster: string;
    if (persona === "student") {
      const school = SCHOOL_CLUSTERS[Math.floor(rand() * SCHOOL_CLUSTERS.length)]!;
      workLon = school.lon + (rand() - 0.5) * 0.003;
      workLat = school.lat + (rand() - 0.5) * 0.003;
      workCluster = school.name;
    } else {
      const cluster = weightedChoice(WORK_CLUSTERS, rand);
      if (!cluster.lon) {
        workLon = homeLon + (rand() - 0.5) * 0.01;
        workLat = homeLat + (rand() - 0.5) * 0.01;
        workCluster = "Local";
      } else {
        workLon = cluster.lon + (rand() - 0.5) * 0.002;
        workLat = cluster.lat + (rand() - 0.5) * 0.002;
        workCluster = cluster.name;
      }
    }

    const legs = buildLegChain(persona, homeLon, homeLat, workLon, workLat, dayProfile, rand);
    agents.push({ id: i, homeLon, homeLat, workLon, workLat, income, transitDep, workCluster, persona, legs });
  }
  return agents;
}

// ── Routing ───────────────────────────────────────────────────────────────────

function routeLeg(
  agentId: number, legIndex: number, leg: AgentLeg,
  persona: Persona, income: "low" | "mid" | "high", transitDep: number,
  homeLon: number, homeLat: number,
  graph: Graph, stops: Map<number, GraphStop>,
): LegRouteResult {
  const congestion = congestionMultiplierAt(leg.departureMin);
  const baseCarMin = carTravelMin(leg.originLon, leg.originLat, leg.destLon, leg.destLat);
  const carMin = +(baseCarMin / congestion).toFixed(2);

  const access = findNearestStop(leg.originLon, leg.originLat, ACCESS_WALK_M, stops);
  const egress = findNearestStop(leg.destLon,   leg.destLat,   ACCESS_WALK_M, stops);

  const base = { agentId, legIndex, purpose: leg.purpose, departureMin: leg.departureMin, carMin, homeLon, homeLat, income, transitDep, persona };

  if (!access || !egress) {
    return { ...base, feasible: false, totalMin: carMin, transitMin: 0, transfers: 0, pathIds: [], edgesUsed: [] };
  }

  const accessWalk = walkMin(access.distM);
  const egressWalk = walkMin(egress.distM);

  if (access.id === egress.id) {
    return { ...base, feasible: true, totalMin: +(accessWalk + egressWalk).toFixed(2), transitMin: 0, transfers: 0, pathIds: [access.id], edgesUsed: [] };
  }

  const result = dijkstra(graph, access.id, egress.id);
  if (!result) {
    return { ...base, feasible: false, totalMin: carMin, transitMin: 0, transfers: 0, pathIds: [], edgesUsed: [] };
  }

  let transfers = 0;
  let prevRoute: string | null = null;
  const edgesUsed: EdgeRecord[] = [];
  for (let i = 0; i < result.path.length - 1; i++) {
    const u = result.path[i]!;
    const v = result.path[i + 1]!;
    const edge = graph.get(u)?.find((e) => e.to === v);
    if (!edge) continue;
    edgesUsed.push({ fromName: edge.fromName, toName: edge.toName, fromLon: edge.fromLon, fromLat: edge.fromLat, toLon: edge.toLon, toLat: edge.toLat, kind: edge.kind, routeName: edge.routeName });
    if (edge.kind === "walk") { transfers++; prevRoute = null; }
    else if (prevRoute && edge.routeName !== prevRoute) { transfers++; prevRoute = edge.routeName; }
    else { prevRoute = edge.routeName; }
  }

  return {
    ...base,
    feasible: true,
    totalMin:   +(accessWalk + result.dist + egressWalk).toFixed(2),
    transitMin: +result.dist.toFixed(2),
    transfers,
    pathIds: result.path,
    edgesUsed,
  };
}

function routeAllLegs(agents: SimAgent[], graph: Graph, stops: Map<number, GraphStop>): LegRouteResult[] {
  const tasks: { agent: SimAgent; legIndex: number; leg: AgentLeg }[] = [];
  for (const a of agents) a.legs.forEach((leg, i) => tasks.push({ agent: a, legIndex: i, leg }));
  tasks.sort((a, b) => a.leg.departureMin - b.leg.departureMin);
  return tasks.map(({ agent: a, legIndex, leg }) =>
    routeLeg(a.id, legIndex, leg, a.persona, a.income, a.transitDep, a.homeLon, a.homeLat, graph, stops)
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo]! + (idx - lo) * (s[hi]! - s[lo]!);
}

function snapshotStats(legResults: LegRouteResult[]): RunStats {
  const commute  = legResults.filter((r) => r.purpose === "commute");
  const feasible = commute.filter((r) => r.feasible);
  const agentIds      = new Set(commute.map((r) => r.agentId));
  const accessibleIds = new Set(feasible.map((r) => r.agentId));
  const byIncome: Record<string, number[]> = {};
  for (const r of feasible) (byIncome[r.income] ??= []).push(r.totalMin);
  return {
    pctAccessible:    +(accessibleIds.size / Math.max(agentIds.size, 1) * 100).toFixed(1),
    avgTransitMin:    +mean(feasible.map((r) => r.transitMin)).toFixed(2),
    medianTransitMin: +median(feasible.map((r) => r.transitMin)).toFixed(2),
    p90TransitMin:    +percentile(feasible.map((r) => r.transitMin), 90).toFixed(2),
    avgTotalMin:      +mean(feasible.map((r) => r.totalMin)).toFixed(2),
    avgTransfers:     +mean(feasible.map((r) => r.transfers)).toFixed(2),
    avgCarMin:        +mean(commute.map((r) => r.carMin)).toFixed(2),
    incomeBreakdown:  Object.fromEntries(Object.entries(byIncome).map(([k, v]) => [k, +mean(v).toFixed(2)])),
  };
}

function equityScore(agents: SimAgent[], legResults: LegRouteResult[]): number {
  const IW: Record<string, number> = { low: 1.5, mid: 1.0, high: 0.5 };
  const agentCommute = new Map<number, LegRouteResult>();
  for (const r of legResults) {
    if (r.purpose !== "commute" || agentCommute.has(r.agentId)) continue;
    agentCommute.set(r.agentId, r);
  }
  // Agents with no routed commute leg count as inaccessible
  for (const a of agents) {
    if (!agentCommute.has(a.id)) {
      agentCommute.set(a.id, { agentId: a.id, legIndex: 0, purpose: "commute", departureMin: 480, feasible: false, totalMin: 0, transitMin: 0, carMin: 0, transfers: 0, pathIds: [], edgesUsed: [], homeLon: a.homeLon, homeLat: a.homeLat, income: a.income, transitDep: a.transitDep, persona: a.persona });
    }
  }
  let weightedAccessible = 0, weightedTotal = 0;
  for (const [, r] of agentCommute) {
    // Infeasible agents have no transit option — they are fully car-dependent by
    // necessity regardless of their sampled transitDep, so count them at full weight.
    const effectiveDep = r.feasible ? r.transitDep : 1.0;
    const w = (IW[r.income] ?? 1) * effectiveDep;
    weightedTotal += w;
    if (r.feasible) weightedAccessible += w;
  }
  if (weightedTotal === 0) return 0;
  return +(weightedAccessible / weightedTotal * 100).toFixed(1);
}

function computeAllStress(
  baseResults: LegRouteResult[],
  scenResults: LegRouteResult[],
  proposed: ProposedLine[],
  topN = 80,
): { existingStress: StressSegment[]; proposedStress: StressSegment[] } {
  type SegInfo = { lineName: string; fromStop: string; toStop: string; fromCoords: [number, number]; toCoords: [number, number] };

  const countEdges = (results: LegRouteResult[], kind: "transit" | "proposed") => {
    const counter = new Map<string, { seg: SegInfo; count: number }>();
    for (const r of results) {
      for (const e of r.edgesUsed) {
        if (e.kind !== kind) continue;
        const key = `${e.fromName}|${e.toName}`;
        if (!counter.has(key)) counter.set(key, { seg: { lineName: e.routeName, fromStop: e.fromName, toStop: e.toName, fromCoords: [e.fromLon, e.fromLat], toCoords: [e.toLon, e.toLat] }, count: 0 });
        counter.get(key)!.count++;
      }
    }
    return counter;
  };

  const baseCounter = countEdges(baseResults, "transit");
  const scenCounter = countEdges(scenResults, "transit");
  const propCounter = proposed.length ? countEdges(scenResults, "proposed") : new Map<string, { seg: SegInfo; count: number }>();

  // Global max across all segment counts — shared denominator for stress_pct
  const globalMax = Math.max(
    ...[...baseCounter.values()].map((v) => v.count),
    ...[...scenCounter.values()].map((v) => v.count),
    ...[...propCounter.values()].map((v) => v.count),
    1,
  );

  // Existing edges: union of base+scen keys, sorted by scenario load
  const existingKeys = new Set([...baseCounter.keys(), ...scenCounter.keys()]);
  const existingRecords: { baseCount: number; scenCount: number; seg: SegInfo }[] = [];
  for (const key of existingKeys) {
    const baseCount = baseCounter.get(key)?.count ?? 0;
    const scenCount = scenCounter.get(key)?.count ?? 0;
    existingRecords.push({ baseCount, scenCount, seg: (scenCounter.get(key) ?? baseCounter.get(key))!.seg });
  }
  existingRecords.sort((a, b) => (b.scenCount || b.baseCount) - (a.scenCount || a.baseCount));

  const existingStress: StressSegment[] = existingRecords.slice(0, topN).map((r) => ({
    ...r.seg,
    agentTrips: r.scenCount,
    baselineTrips: r.baseCount,
    stressPct: +(r.scenCount / globalMax * 100).toFixed(1),
    deltaPct: +((r.baseCount - r.scenCount) / globalMax * 100).toFixed(1),
  }));

  // Proposed edges: new lines only
  const proposedStress: StressSegment[] = [...propCounter.values()]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      ...r.seg,
      agentTrips: r.count,
      baselineTrips: 0,
      stressPct: +(r.count / globalMax * 100).toFixed(1),
      deltaPct: 0,
    }));

  return { existingStress, proposedStress };
}

// ── Public API ────────────────────────────────────────────────────────────────

const ANIM_SAMPLE = 500;

export async function runSimulation(opts: {
  proposed: ProposedLine[];
  agentCount: number;
  seed: number;
  timeRange: { startMin: number; endMin: number };
  transitSpeeds?: TransitSpeedData;
}): Promise<SimulationResult> {
  const t0 = Date.now();
  const hasProposed = opts.proposed.length > 0;

  // Discard live speeds if the client sent data older than 10 minutes
  const tenMinMs = 10 * 60 * 1000;
  const speedsAreStale =
    opts.transitSpeeds?.updatedAt != null &&
    Date.now() - opts.transitSpeeds.updatedAt > tenMinMs;
  // Only apply live speeds when they're fresh and from a live source
  const resolvedSpeeds =
    !speedsAreStale && opts.transitSpeeds?.source === "live"
      ? opts.transitSpeeds
      : undefined;

  // Validate incoming live speeds: fall back per-type if a value is implausible
  const liveSpeeds = resolvedSpeeds?.speeds;
  const effectiveSpeeds: Record<string, number> = Object.fromEntries(
    (Object.keys(SPEED) as (keyof typeof SPEED)[]).map((t) => {
      const v = liveSpeeds?.[t];
      return [t, v != null && v >= 1 && v <= 200 ? v : SPEED[t]];
    }),
  );
  const livePenalties = resolvedSpeeds?.boardingPenalties;
  const effectivePenalties: Record<string, number> = Object.fromEntries(
    (Object.keys(BOARD_PENALTY) as (keyof typeof BOARD_PENALTY)[]).map((t) => {
      const v = livePenalties?.[t];
      return [t, v != null && v >= 0 && v <= 30 ? v : BOARD_PENALTY[t]];
    }),
  );

  const { graph: baseGraph, stops: baseStops } = buildGraph([], effectiveSpeeds, effectivePenalties);
  const { graph: scenGraph, stops: scenStops } = hasProposed ? buildGraph(opts.proposed, effectiveSpeeds, effectivePenalties) : { graph: baseGraph, stops: baseStops };

  const dayProfile = generateDayProfile(opts.seed);
  const agents = await generateAgents(Math.max(50, Math.min(opts.agentCount, 10_000)), opts.seed, dayProfile);

  const baseResults = routeAllLegs(agents, baseGraph, baseStops);
  const scenResults = hasProposed ? routeAllLegs(agents, scenGraph, scenStops) : baseResults;

  const baseStats  = snapshotStats(baseResults);
  const scenStats  = snapshotStats(scenResults);
  const baseEquity = equityScore(agents, baseResults);
  const scenEquity = equityScore(agents, scenResults);

  // Build per-leg output filtered to timeRange
  const { startMin, endMin } = opts.timeRange;
  const baseMap = new Map<string, LegRouteResult>();
  const scenMap = new Map<string, LegRouteResult>();
  for (const r of baseResults) baseMap.set(`${r.agentId}-${r.legIndex}`, r);
  for (const r of scenResults) scenMap.set(`${r.agentId}-${r.legIndex}`, r);

  const animSet = new Set<number>();
  for (const a of agents) {
    if (animSet.size >= ANIM_SAMPLE) break;
    animSet.add(a.id);
  }

  const perAgent: PerAgentDelta[] = [];
  for (const a of agents) {
    a.legs.forEach((leg, legIndex) => {
      if (leg.departureMin < startMin || leg.departureMin >= endMin) return;
      const key = `${a.id}-${legIndex}`;
      const b = baseMap.get(key)!;
      const s = scenMap.get(key) ?? b;
      const activeTrip = hasProposed ? s : b;
      let pathCoords: [number, number][] = [];
      if (animSet.has(a.id) && activeTrip.feasible && activeTrip.edgesUsed.length > 0) {
        pathCoords = [[activeTrip.edgesUsed[0]!.fromLon, activeTrip.edgesUsed[0]!.fromLat]];
        for (const e of activeTrip.edgesUsed) pathCoords.push([e.toLon, e.toLat]);
      }
      perAgent.push({
        agentId: a.id,
        homeLon: a.homeLon, homeLat: a.homeLat,
        income: a.income, transitDep: a.transitDep,
        persona: a.persona, purpose: leg.purpose,
        departureMin: leg.departureMin,
        baselineTime: b.totalMin, scenarioTime: s.totalMin,
        timeSavedMin: +(b.totalMin - s.totalMin).toFixed(2),
        newlyAccessible: !b.feasible && s.feasible,
        pathCoords,
      });
    });
  }

  const newlyAccessible = perAgent.filter((p) => p.newlyAccessible).length;
  const { existingStress, proposedStress } = computeAllStress(baseResults, scenResults, opts.proposed);

  return {
    hasProposedLines: hasProposed,
    agentCount: agents.length,
    animatedAgentCount: animSet.size,
    runDurationS: +((Date.now() - t0) / 1000).toFixed(2),
    timeRange: { startMin, endMin },
    baseline: baseStats,
    scenario: scenStats,
    delta: {
      timeSavedMin:          +(baseStats.avgTransitMin - scenStats.avgTransitMin).toFixed(2),
      totalTimeSavedMin:     +(baseStats.avgTotalMin   - scenStats.avgTotalMin).toFixed(2),
      accessibilityGainPct:  +(scenStats.pctAccessible - baseStats.pctAccessible).toFixed(1),
      transferReduction:     +(baseStats.avgTransfers  - scenStats.avgTransfers).toFixed(2),
      equityImprovement:     +(scenEquity - baseEquity).toFixed(1),
      newlyAccessibleAgents: newlyAccessible,
    },
    equity: { baselineScore: baseEquity, scenarioScore: scenEquity },
    lineStress:         proposedStress,
    baselineEdgeStress: existingStress,
    perAgent,
    graphStats: {
      nodes:         baseStops.size,
      edges:         [...baseGraph.values()].reduce((n, es) => n + es.length, 0),
      scenarioNodes: scenStops.size,
      scenarioEdges: [...scenGraph.values()].reduce((n, es) => n + es.length, 0),
    },
    transitSpeedSource:    resolvedSpeeds?.source         ?? "fallback",
    transitUpdatedAt:      resolvedSpeeds?.updatedAt      ?? null,
    transitTripCount:      resolvedSpeeds?.tripCount      ?? 0,
    transitRoadMultiplier: resolvedSpeeds?.roadMultiplier ?? 1.0,
  };
}
