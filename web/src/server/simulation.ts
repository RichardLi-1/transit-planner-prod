/**
 * Self-contained transit simulation engine.
 *
 * Builds a transit graph from the existing ROUTES / BUS_ROUTES / GO_TRAIN_ROUTES
 * constants (which have real geocoded stop coordinates), routes synthetic agents
 * through it using Dijkstra, and scores baseline vs scenario comparisons.
 *
 * No Python server or direct DB connection required.
 */
import "server-only";

import { ROUTES, BUS_ROUTES, GO_TRAIN_ROUTES } from "~/app/map/transit-data";
import type { Route } from "~/app/map/transit-data";
import { supabase } from "./supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

const WALK_TRANSFER_M = 400;    // max walk to transfer between lines
const ACCESS_WALK_M   = 800;    // max walk from home/work to a stop
const WALK_SPEED_MPS  = 5 / 3.6;
// Car speed varies by distance from downtown core:
//   0–3 km  : ~20 km/h (matches bus speed — gridlock)
//   3–8 km  : ~28 km/h (inner suburbs, still congested)
//   8–15 km : ~35 km/h (mid suburbs)
//   15+ km  : ~45 km/h (outer suburbs, expressway access)
const CAR_SPEED_ZONES: { maxDistM: number; speedKmh: number }[] = [
  { maxDistM:  3_000, speedKmh: 20 },
  { maxDistM:  8_000, speedKmh: 28 },
  { maxDistM: 15_000, speedKmh: 35 },
  { maxDistM: Infinity, speedKmh: 45 },
];
const DOWNTOWN_LON = -79.382;
const DOWNTOWN_LAT =  43.649;

// Transit speeds by route type
const SPEED: Record<Route["type"], number> = {
  subway:    35,
  lrt:       25,
  streetcar: 15,
  bus:       20,
  go_train:  60,
};

// Boarding wait penalty (minutes) per route type
const BOARD_PENALTY: Record<Route["type"], number> = {
  subway:    2,
  lrt:       2.5,
  streetcar: 3,
  bus:       4,
  go_train:  5,
};

// ── Employment clusters (Toronto) ─────────────────────────────────────────────

// Work destinations — intentionally downtown-heavy.
// Union/King/Queen/Financial District absorb ~50% of all commuters.
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphStop {
  id: number;           // unique integer ID used as graph key
  name: string;
  lon: number;
  lat: number;
  routeId: string;
  routeType: Route["type"];
}

interface GraphEdge {
  to: number;
  weight: number;       // minutes
  kind: "transit" | "walk" | "proposed";
  routeName: string;
  fromLon: number; fromLat: number;
  toLon: number;   toLat: number;
  fromName: string;
  toName: string;
}

type Graph = Map<number, GraphEdge[]>;

export interface SimAgent {
  id: number;
  homeLon: number;
  homeLat: number;
  workLon: number;
  workLat: number;
  income: "low" | "mid" | "high";
  transitDep: number;
  workCluster: string;
}

export interface TripResult {
  agentId: number;
  feasible: boolean;
  totalMin: number;
  transitMin: number;
  accessWalkMin: number;
  egressWalkMin: number;
  transfers: number;
  pathIds: number[];
  carMin: number;
  edgesUsed: { fromName: string; toName: string; fromLon: number; fromLat: number; toLon: number; toLat: number; kind: string; routeName: string }[];
}

export interface ProposedLineStop { name: string; coords: [number, number] }
export interface ProposedLine { name: string; type: string; stops: ProposedLineStop[] }

export interface SimulationResult {
  hasProposedLines: boolean;
  agentCount: number;
  runDurationS: number;
  baseline: RunStats;
  scenario: RunStats;
  delta: DeltaStats;
  equity: { baselineScore: number; scenarioScore: number };
  lineStress: StressSegment[];
  baselineEdgeStress: StressSegment[];
  perAgent: PerAgentDelta[];
  graphStats: { nodes: number; edges: number };
}

export interface StressSegment {
  lineName: string;
  fromStop: string;
  toStop: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  agentTrips: number;
  stressPct: number;
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
  homeLon: number; homeLat: number;
  income: string;
  transitDep: number;
  baselineTime: number;
  scenarioTime: number;
  timeSavedMin: number;
  newlyAccessible: boolean;
  // Full coordinate path for animation [[lon,lat], ...], empty if infeasible
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

// Estimate car travel time by sampling the straight-line path in small steps
// and applying the speed zone at each sample point's distance from downtown.
function carTravelMin(homeLon: number, homeLat: number, workLon: number, workLat: number): number {
  const totalDistM = haversineM(homeLon, homeLat, workLon, workLat);
  if (totalDistM < 1) return 0;

  const STEPS = 10;
  let totalMin = 0;
  const segDistM = totalDistM / STEPS;

  for (let i = 0; i < STEPS; i++) {
    const t = (i + 0.5) / STEPS; // midpoint of this segment
    const lon = homeLon + t * (workLon - homeLon);
    const lat = homeLat + t * (workLat - homeLat);
    const distFromCore = haversineM(lon, lat, DOWNTOWN_LON, DOWNTOWN_LAT);
    const zone = CAR_SPEED_ZONES.find((z) => distFromCore <= z.maxDistM)!;
    totalMin += (segDistM / 1000 / zone.speedKmh) * 60;
  }

  return +totalMin.toFixed(2);
}

// ── Graph construction ────────────────────────────────────────────────────────

function buildGraph(extra: ProposedLine[] = []): { graph: Graph; stops: Map<number, GraphStop> } {
  const stopMap = new Map<number, GraphStop>();
  const graph: Graph = new Map();
  let nextId = 1;

  // Deduplicate by name — same stop may appear on multiple routes
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

  // Add all existing routes
  const allRoutes: Route[] = [
    ...ROUTES.filter((r) => r.type === "subway" || r.type === "lrt"),
    ...ROUTES.filter((r) => r.type === "streetcar"),
    ...BUS_ROUTES,
    ...GO_TRAIN_ROUTES,
  ];

  for (const route of allRoutes) {
    const speed   = SPEED[route.type] ?? 22;
    const penalty = BOARD_PENALTY[route.type] ?? 4;
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

  // Walking transfer edges between stops on different routes within WALK_TRANSFER_M
  const stopList = Array.from(stopMap.values());
  // Tile index
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

  // Add proposed lines
  let virtualId = -1;
  for (const line of extra) {
    const speed   = (SPEED as Record<string, number>)[line.type] ?? 22;
    const penalty = (BOARD_PENALTY as Record<string, number>)[line.type] ?? 4;
    const lineStops = line.stops;
    let prevId: number | null = null;

    for (const stop of lineStops) {
      const [lon, lat] = stop.coords;
      const id = virtualId--;
      stopMap.set(id, { id, name: stop.name, lon, lat, routeId: `proposed-${line.name}`, routeType: (line.type as Route["type"]) ?? "bus" });
      graph.set(id, []);

      // Walking transfer to nearby existing stops
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

type HeapItem = [number, number]; // [cost, nodeId]

function dijkstra(graph: Graph, src: number, dst: number): { dist: number; path: number[] } | null {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  // Simple min-heap (array sorted on insertion for small graphs)
  const heap: HeapItem[] = [[0, src]];
  dist.set(src, 0);

  while (heap.length > 0) {
    // Pop minimum
    heap.sort((a, b) => a[0] - b[0]);
    const [cost, u] = heap.shift()!;
    if (u === dst) {
      const path: number[] = [];
      let cur: number | undefined = dst;
      while (cur !== undefined) {
        path.unshift(cur);
        cur = prev.get(cur);
      }
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

// ── Nearest stop index ────────────────────────────────────────────────────────

function findNearestStop(
  lon: number, lat: number, maxM: number,
  stops: Map<number, GraphStop>
): { id: number; distM: number } | null {
  let best: { id: number; distM: number } | null = null;
  for (const s of stops.values()) {
    // Only connect to real stops (not virtual proposed stops) for access
    if (s.id < 0) continue;
    const d = haversineM(lon, lat, s.lon, s.lat);
    if (d <= maxM && (!best || d < best.distM)) {
      best = { id: s.id, distM: d };
    }
  }
  return best;
}

// ── Agent generation ──────────────────────────────────────────────────────────

// Seeded PRNG (simple LCG so results are reproducible)
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
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

async function loadPopulationPoints(): Promise<{ lon: number; lat: number; weight: number }[]> {
  // Fetch the most populated cells first so the limit captures dense areas across
  // the whole city rather than whatever happened to be inserted first.
  const { data, error } = await supabase
    .from("pop_data")
    .select("longitude, latitude, population")
    .gte("latitude", 43.4).lte("latitude", 43.9)
    .gte("longitude", -79.7).lte("longitude", -79.1)
    .gt("population", 0)
    .order("population", { ascending: false })
    .limit(5000);

  if (error || !data?.length) {
    // Fallback: hardcoded Toronto neighbourhood centroids with relative weights
    return [
      { lon: -79.382, lat: 43.649, weight: 10 }, // Downtown
      { lon: -79.420, lat: 43.668, weight:  8 }, // Annex
      { lon: -79.450, lat: 43.655, weight:  7 }, // Roncesvalles
      { lon: -79.350, lat: 43.690, weight:  9 }, // East York
      { lon: -79.310, lat: 43.710, weight:  8 }, // Scarborough W
      { lon: -79.260, lat: 43.770, weight:  6 }, // Scarborough E
      { lon: -79.540, lat: 43.645, weight:  5 }, // Etobicoke
      { lon: -79.410, lat: 43.760, weight:  7 }, // North York
      { lon: -79.480, lat: 43.700, weight:  5 }, // Weston
      { lon: -79.390, lat: 43.720, weight:  6 }, // Lawrence Park
    ];
  }

  return (data as { longitude: number; latitude: number; population: number }[]).map((r) => ({
    lon: r.longitude,
    lat: r.latitude,
    weight: r.population,
  }));
}

export async function generateAgents(n: number, seed: number): Promise<SimAgent[]> {
  const rand = makePrng(seed);
  const popPoints = await loadPopulationPoints();

  // income bands by distance from downtown (rough proxy)
  function incomeFor(lon: number, lat: number): { income: SimAgent["income"]; transitDep: number } {
    const d = haversineM(lon, lat, -79.382, 43.649);
    if (d < 3000)       return { income: "low",  transitDep: 0.85 + rand() * 0.1 };
    if (d < 8000)       return { income: "mid",  transitDep: 0.5  + rand() * 0.2 };
    if (d < 15000)      return { income: "mid",  transitDep: 0.35 + rand() * 0.2 };
    const r = rand();
    if (r < 0.35)       return { income: "low",  transitDep: 0.6 + rand() * 0.15 };
    if (r < 0.7)        return { income: "mid",  transitDep: 0.3 + rand() * 0.2 };
    return               { income: "high", transitDep: 0.1 + rand() * 0.15 };
  }

  const agents: SimAgent[] = [];
  for (let i = 0; i < n; i++) {
    const pt = weightedChoice(popPoints, rand);
    // Jitter radius scales with distance from downtown so suburban agents
    // aren't all pinned to a single census cell centroid (~150m downtown, ~600m outer)
    const distFromCore = haversineM(pt.lon, pt.lat, DOWNTOWN_LON, DOWNTOWN_LAT);
    const jitterDeg = 0.0015 + (distFromCore / 30_000) * 0.004; // ~150m–600m
    const homeLon = pt.lon + (rand() - 0.5) * jitterDeg;
    const homeLat = pt.lat + (rand() - 0.5) * jitterDeg;
    const { income, transitDep } = incomeFor(homeLon, homeLat);

    const cluster = weightedChoice(WORK_CLUSTERS, rand);
    let workLon: number, workLat: number, workCluster: string;
    if (!cluster.lon) {
      // Local — work near home
      workLon = homeLon + (rand() - 0.5) * 0.01;
      workLat = homeLat + (rand() - 0.5) * 0.01;
      workCluster = "Local";
    } else {
      workLon = cluster.lon + (rand() - 0.5) * 0.002;
      workLat = cluster.lat + (rand() - 0.5) * 0.002;
      workCluster = cluster.name;
    }

    agents.push({ id: i, homeLon, homeLat, workLon, workLat, income, transitDep, workCluster });
  }
  return agents;
}

// ── Routing ───────────────────────────────────────────────────────────────────

function routeAgent(agent: SimAgent, graph: Graph, stops: Map<number, GraphStop>): TripResult {
  const carMin = carTravelMin(agent.homeLon, agent.homeLat, agent.workLon, agent.workLat);

  const access = findNearestStop(agent.homeLon, agent.homeLat, ACCESS_WALK_M, stops);
  const egress = findNearestStop(agent.workLon, agent.workLat, ACCESS_WALK_M, stops);

  if (!access || !egress) {
    return { agentId: agent.id, feasible: false, totalMin: carMin, transitMin: 0, accessWalkMin: 0, egressWalkMin: 0, transfers: 0, pathIds: [], carMin, edgesUsed: [] };
  }

  const accessWalk = walkMin(access.distM);
  const egressWalk = walkMin(egress.distM);

  if (access.id === egress.id) {
    return { agentId: agent.id, feasible: true, totalMin: accessWalk + egressWalk, transitMin: 0, accessWalkMin: accessWalk, egressWalkMin: egressWalk, transfers: 0, pathIds: [access.id], carMin, edgesUsed: [] };
  }

  const result = dijkstra(graph, access.id, egress.id);
  if (!result) {
    return { agentId: agent.id, feasible: false, totalMin: carMin, transitMin: 0, accessWalkMin: accessWalk, egressWalkMin: egressWalk, transfers: 0, pathIds: [], carMin, edgesUsed: [] };
  }

  // Count transfers and collect edges
  let transfers = 0;
  let prevRoute: string | null = null;
  const edgesUsed: TripResult["edgesUsed"] = [];
  for (let i = 0; i < result.path.length - 1; i++) {
    const u = result.path[i]!;
    const v = result.path[i + 1]!;
    const edge = graph.get(u)?.find((e) => e.to === v);
    if (!edge) continue;
    edgesUsed.push({ fromName: edge.fromName, toName: edge.toName, fromLon: edge.fromLon, fromLat: edge.fromLat, toLon: edge.toLon, toLat: edge.toLat, kind: edge.kind, routeName: edge.routeName });
    if (edge.kind === "walk") {
      transfers++;
      prevRoute = null;
    } else if (prevRoute && edge.routeName !== prevRoute) {
      transfers++;
      prevRoute = edge.routeName;
    } else {
      prevRoute = edge.routeName;
    }
  }

  return {
    agentId: agent.id,
    feasible: true,
    totalMin: +(accessWalk + result.dist + egressWalk).toFixed(2),
    transitMin: +result.dist.toFixed(2),
    accessWalkMin: +accessWalk.toFixed(2),
    egressWalkMin: +egressWalk.toFixed(2),
    transfers,
    pathIds: result.path,
    carMin: +carMin.toFixed(2),
    edgesUsed,
  };
}

function routeAll(agents: SimAgent[], graph: Graph, stops: Map<number, GraphStop>): TripResult[] {
  return agents.map((a) => routeAgent(a, graph, stops));
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

function snapshotStats(agents: SimAgent[], results: TripResult[]): RunStats {
  const feasible = results.filter((r) => r.feasible);
  const byIncome: Record<string, number[]> = {};
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  for (const r of feasible) {
    const a = agentMap.get(r.agentId);
    if (a) (byIncome[a.income] ??= []).push(r.totalMin);
  }
  return {
    pctAccessible: +(feasible.length / Math.max(results.length, 1) * 100).toFixed(1),
    avgTransitMin: +mean(feasible.map((r) => r.transitMin)).toFixed(2),
    medianTransitMin: +median(feasible.map((r) => r.transitMin)).toFixed(2),
    p90TransitMin: +percentile(feasible.map((r) => r.transitMin), 90).toFixed(2),
    avgTotalMin: +mean(feasible.map((r) => r.totalMin)).toFixed(2),
    avgTransfers: +mean(feasible.map((r) => r.transfers)).toFixed(2),
    avgCarMin: +mean(results.map((r) => r.carMin)).toFixed(2),
    incomeBreakdown: Object.fromEntries(Object.entries(byIncome).map(([k, v]) => [k, +mean(v).toFixed(2)])),
  };
}

function equityScore(agents: SimAgent[], results: TripResult[]): number {
  // Equity = weighted accessibility rate.
  // Each agent contributes (income weight × transit dependency) to the numerator
  // if they have a feasible transit path, or 0 if not.
  // Low-income agents count 1.5×: transit access matters more when you can't afford a car.
  const IW: Record<string, number> = { low: 1.5, mid: 1.0, high: 0.5 };
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  let weightedAccessible = 0;
  let weightedTotal = 0;
  for (const r of results) {
    const a = agentMap.get(r.agentId);
    if (!a) continue;
    const w = (IW[a.income] ?? 1) * a.transitDep;
    weightedTotal += w;
    if (r.feasible) weightedAccessible += w;
  }
  if (weightedTotal === 0) return 0;
  return +(weightedAccessible / weightedTotal * 100).toFixed(1);
}

function computeProposedStress(_baseline: TripResult[], scenario: TripResult[], proposed: ProposedLine[]): StressSegment[] {
  if (!proposed.length) return [];
  const counter = new Map<string, { seg: StressSegment; count: number }>();
  for (const r of scenario) {
    for (const e of r.edgesUsed) {
      if (e.kind !== "proposed") continue;
      const key = `${e.fromName}|${e.toName}`;
      if (!counter.has(key)) {
        counter.set(key, {
          seg: { lineName: e.routeName, fromStop: e.fromName, toStop: e.toName, fromCoords: [e.fromLon, e.fromLat], toCoords: [e.toLon, e.toLat], agentTrips: 0, stressPct: 0 },
          count: 0,
        });
      }
      counter.get(key)!.count++;
    }
  }
  const records = [...counter.values()].sort((a, b) => b.count - a.count);
  const maxTrips = records[0]?.count ?? 1;
  return records.map(({ seg, count }) => ({ ...seg, agentTrips: count, stressPct: +(count / maxTrips * 100).toFixed(1) }));
}

function computeBaselineStress(results: TripResult[], topN = 80): StressSegment[] {
  const counter = new Map<string, { seg: StressSegment; count: number }>();
  for (const r of results) {
    for (const e of r.edgesUsed) {
      if (e.kind !== "transit") continue;
      const key = `${e.fromName}|${e.toName}`;
      if (!counter.has(key)) {
        counter.set(key, {
          seg: { lineName: e.routeName, fromStop: e.fromName, toStop: e.toName, fromCoords: [e.fromLon, e.fromLat], toCoords: [e.toLon, e.toLat], agentTrips: 0, stressPct: 0 },
          count: 0,
        });
      }
      counter.get(key)!.count++;
    }
  }
  const records = [...counter.values()].sort((a, b) => b.count - a.count).slice(0, topN);
  const maxTrips = records[0]?.count ?? 1;
  return records.map(({ seg, count }) => ({ ...seg, agentTrips: count, stressPct: +(count / maxTrips * 100).toFixed(1) }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runSimulation(opts: {
  proposed: ProposedLine[];
  agentCount: number;
  seed: number;
}): Promise<SimulationResult> {
  const t0 = Date.now();
  const hasProposed = opts.proposed.length > 0;

  const { graph: baseGraph, stops: baseStops } = buildGraph([]);
  const { graph: scenGraph, stops: scenStops } = hasProposed ? buildGraph(opts.proposed) : { graph: baseGraph, stops: baseStops };

  const agents = await generateAgents(Math.max(50, Math.min(opts.agentCount, 2000)), opts.seed);

  const baseResults = routeAll(agents, baseGraph, baseStops);
  const scenResults = hasProposed ? routeAll(agents, scenGraph, scenStops) : baseResults;

  const baseStats  = snapshotStats(agents, baseResults);
  const scenStats  = snapshotStats(agents, scenResults);
  const baseEquity = equityScore(agents, baseResults);
  const scenEquity = equityScore(agents, scenResults);

  // Index results by agentId for O(1) lookup
  const baseMap = new Map(baseResults.map((r) => [r.agentId, r]));
  const scenMap = new Map(scenResults.map((r) => [r.agentId, r]));

  const perAgent: PerAgentDelta[] = agents.map((a) => {
    const b = baseMap.get(a.id)!;
    const s = scenMap.get(a.id)!;

    // Build path coords from the active trip's edges (scenario when proposed, else baseline)
    const activeTrip = hasProposed ? s : b;
    let pathCoords: [number, number][] = [];
    if (activeTrip.feasible && activeTrip.edgesUsed.length > 0) {
      pathCoords = [[activeTrip.edgesUsed[0]!.fromLon, activeTrip.edgesUsed[0]!.fromLat]];
      for (const e of activeTrip.edgesUsed) {
        pathCoords.push([e.toLon, e.toLat]);
      }
    }

    return {
      homeLon: a.homeLon, homeLat: a.homeLat,
      income: a.income, transitDep: a.transitDep,
      baselineTime: b.totalMin, scenarioTime: s.totalMin,
      timeSavedMin: +(b.totalMin - s.totalMin).toFixed(2),
      newlyAccessible: !b.feasible && s.feasible,
      pathCoords,
    };
  });

  const newlyAccessible = perAgent.filter((p) => p.newlyAccessible).length;

  return {
    hasProposedLines: hasProposed,
    agentCount: agents.length,
    runDurationS: +((Date.now() - t0) / 1000).toFixed(2),
    baseline: baseStats,
    scenario: scenStats,
    delta: {
      timeSavedMin:         +(baseStats.avgTransitMin - scenStats.avgTransitMin).toFixed(2),
      totalTimeSavedMin:    +(baseStats.avgTotalMin   - scenStats.avgTotalMin).toFixed(2),
      accessibilityGainPct: +(scenStats.pctAccessible - baseStats.pctAccessible).toFixed(1),
      transferReduction:    +(baseStats.avgTransfers  - scenStats.avgTransfers).toFixed(2),
      equityImprovement:    +(scenEquity - baseEquity).toFixed(1),
      newlyAccessibleAgents: newlyAccessible,
    },
    equity: { baselineScore: baseEquity, scenarioScore: scenEquity },
    lineStress:        computeProposedStress(baseResults, scenResults, opts.proposed),
    baselineEdgeStress: computeBaselineStress(baseResults),
    perAgent,
    graphStats: { nodes: baseStops.size, edges: [...baseGraph.values()].reduce((n, es) => n + es.length, 0) },
  };
}
