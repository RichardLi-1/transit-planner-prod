import "server-only";

import { haversineKm } from "~/app/map/geo-utils";
import {
  ROUTES,
  BUS_ROUTES,
  GO_TRAIN_ROUTES,
  type Route,
} from "~/app/map/transit-data";
import { TORONTO_NEIGHBOURHOODS } from "~/app/map/toronto-neighbourhoods";
import { POPULATION_CENTERS } from "~/app/map/population-centers";
import { TORONTO_BBOX } from "./ai-map-tools";

// 📖 Learn: transit-data lives under app/map — importing it server-side is fine
// because it's static JSON-like route data, not a React component.

const ALL_ROUTES: Route[] = [...ROUTES, ...BUS_ROUTES, ...GO_TRAIN_ROUTES];

type BBox = [number, number, number, number];

function asBBox(raw: unknown): BBox | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums as BBox;
}

function asPoint(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lng = Number(raw[0]);
  const lat = Number(raw[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function inBBox(lng: number, lat: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/**
 * Max area (km²) for an AI highlight polygon. A focused coverage gap or demand
 * cluster is at most a few km across; anything bigger (a whole borough — or the
 * model accidentally shading Lake Ontario) isn't actionable, so we drop it.
 * ~25 km² ≈ a 5 km × 5 km area, already generous. Tunable.
 */
const MAX_HIGHLIGHT_KM2 = 25;

/**
 * Approximate polygon area in km² via the shoelace formula, converting degrees
 * → km at Toronto's latitude (a degree of longitude is much shorter than a
 * degree of latitude this far north, so we can't treat them as equal).
 * 📖 Learn: shoelace formula — polygon area from ordered vertices via cross products.
 */
function polygonAreaKm2(points: [number, number][]): number {
  const KM_PER_DEG_LAT = 110.574;
  const KM_PER_DEG_LNG = 111.32 * Math.cos((43.7 * Math.PI) / 180); // ~80.5 km at 43.7°N
  let cross = 0;
  for (let i = 0; i < points.length; i++) {
    const [lng1, lat1] = points[i]!;
    const [lng2, lat2] = points[(i + 1) % points.length]!;
    cross += lng1 * lat2 - lng2 * lat1;
  }
  const areaDeg2 = Math.abs(cross) / 2;
  return areaDeg2 * KM_PER_DEG_LAT * KM_PER_DEG_LNG;
}

function stopInBBox(
  stop: { name: string; coords: [number, number] },
  bbox: BBox,
): boolean {
  return inBBox(stop.coords[0], stop.coords[1], bbox);
}

function routeTouchesBBox(route: Route, bbox: BBox): boolean {
  if (route.stops.some((s) => stopInBBox(s, bbox))) return true;
  if (route.shape?.some(([lng, lat]) => inBBox(lng, lat, bbox))) return true;
  return false;
}

export type QueryNetworkInput = {
  kind?: string;
  bbox?: unknown;
  point?: unknown;
};

export function handleQueryNetwork(input: QueryNetworkInput): unknown {
  const kind = input.kind;
  if (kind === "nearest_stop") {
    const point = asPoint(input.point);
    if (!point) return { error: "point [lng, lat] required for nearest_stop" };
    let best: { name: string; route: string; coords: [number, number]; km: number } | null =
      null;
    for (const route of ALL_ROUTES) {
      for (const stop of route.stops) {
        const km = haversineKm(point, stop.coords);
        if (!best || km < best.km) {
          best = { name: stop.name, route: route.name, coords: stop.coords, km };
        }
      }
    }
    return best ?? { error: "no stops found" };
  }

  const bbox = asBBox(input.bbox) ?? TORONTO_BBOX;

  if (kind === "stops_in_bbox") {
    const stops: Array<{ name: string; route: string; coords: [number, number] }> = [];
    for (const route of ALL_ROUTES) {
      for (const stop of route.stops) {
        if (stopInBBox(stop, bbox)) {
          stops.push({ name: stop.name, route: route.name, coords: stop.coords });
        }
      }
    }
    return { count: stops.length, stops: stops.slice(0, 50) };
  }

  if (kind === "routes_in_bbox") {
    const routes = ALL_ROUTES.filter((r) => routeTouchesBBox(r, bbox)).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      stopCount: r.stops.length,
    }));
    return { count: routes.length, routes: routes.slice(0, 30) };
  }

  return { error: `unknown kind: ${String(kind)}` };
}

// ── Geospatial awareness helpers (Phase 1: give the AI real "eyes") ──────────

/**
 * Ray-casting point-in-polygon test.
 * 📖 Learn: shoot a ray from the point; count edge crossings — odd = inside.
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Name of the Toronto neighbourhood containing a point, or null. */
function neighbourhoodAt(lng: number, lat: number): string | null {
  for (const f of TORONTO_NEIGHBOURHOODS.features) {
    const ring = f.geometry.coordinates[0];
    if (ring && pointInRing(lng, lat, ring)) {
      return String(f.properties?.name ?? f.properties?.id ?? "unknown");
    }
  }
  return null;
}

/** Average-of-vertices centroid for a polygon ring. */
function ringCentroid(ring: number[][]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const p of ring) {
    lng += p[0]!;
    lat += p[1]!;
  }
  return [lng / ring.length, lat / ring.length];
}

/** Closest stop across every route to a point, with its distance in km. */
function nearestStop(point: [number, number]): { name: string; route: string; km: number } | null {
  let best: { name: string; route: string; km: number } | null = null;
  for (const route of ALL_ROUTES) {
    for (const stop of route.stops) {
      const km = haversineKm(point, stop.coords);
      if (!best || km < best.km) best = { name: stop.name, route: route.name, km };
    }
  }
  return best;
}

/**
 * describe_location — grounds the AI at a point so it stops hallucinating.
 * Returns the neighbourhood, nearest stop, nearest population centre, and a
 * `likelyInhabited` flag the model should check before highlighting (so it
 * doesn't shade Lake Ontario or empty land as a "gap").
 */
export function handleDescribeLocation(input: { point?: unknown }): unknown {
  const point = asPoint(input.point);
  if (!point) return { error: "point [lng, lat] required" };

  const neighbourhood = neighbourhoodAt(point[0], point[1]);
  const stop = nearestStop(point);

  let center: { name: string; km: number; population: number } | null = null;
  for (const c of POPULATION_CENTERS) {
    const km = haversineKm(point, [c.lng, c.lat]);
    if (!center || km < center.km) center = { name: c.name, km, population: c.population };
  }

  // No known neighbourhood AND >8 km from any population centre ⇒ probably
  // water/uninhabited. The model is told not to highlight where this is false.
  const likelyInhabited = neighbourhood !== null || (center !== null && center.km < 8);

  return {
    point,
    neighbourhood,
    nearestStop: stop ? { name: stop.name, route: stop.route, km: +stop.km.toFixed(2) } : null,
    nearestPopulationCenter: center
      ? { name: center.name, km: +center.km.toFixed(2), population: center.population }
      : null,
    likelyInhabited,
  };
}

/**
 * find_coverage_gaps — server-computed REAL gaps. Scans inhabited neighbourhood
 * centroids and returns those far from any stop (default ≥1 km), worst-first.
 * Every result is on land and named, so the AI can highlight true gaps instead
 * of guessing. NOTE: currently limited to the ~16 catalogued neighbourhoods —
 * widening to the fine-grained population raster is a future enhancement.
 */
export function handleFindCoverageGaps(input: { bbox?: unknown; minStopKm?: unknown }): unknown {
  const bbox = asBBox(input.bbox) ?? TORONTO_BBOX;
  const rawThreshold = Number(input.minStopKm);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : 1.0;

  const gaps: Array<{
    neighbourhood: string;
    centroid: [number, number];
    nearestStopKm: number;
    nearestStop: string;
  }> = [];

  for (const f of TORONTO_NEIGHBOURHOODS.features) {
    const ring = f.geometry.coordinates[0];
    if (!ring) continue;
    const [lng, lat] = ringCentroid(ring);
    if (!inBBox(lng, lat, bbox)) continue;
    const stop = nearestStop([lng, lat]);
    if (stop && stop.km >= threshold) {
      gaps.push({
        neighbourhood: String(f.properties?.name ?? f.properties?.id ?? "unknown"),
        centroid: [+lng.toFixed(5), +lat.toFixed(5)],
        nearestStopKm: +stop.km.toFixed(2),
        nearestStop: stop.name,
      });
    }
  }

  gaps.sort((a, b) => b.nearestStopKm - a.nearestStopKm);
  return { count: gaps.length, thresholdKm: threshold, gaps };
}

/** Dispatch any READ map tool (non-mutating) by name. */
export function handleReadTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "query_network":
      return handleQueryNetwork(input as QueryNetworkInput);
    case "describe_location":
      return handleDescribeLocation(input);
    case "find_coverage_gaps":
      return handleFindCoverageGaps(input);
    default:
      return { error: `unknown read tool: ${name}` };
  }
}

/** Drop write-tool calls whose coordinates fall outside the city bbox. */
export function validateWriteToolArgs(
  name: string,
  args: Record<string, unknown>,
): boolean {
  const [west, south, east, north] = TORONTO_BBOX;

  function okLngLat(lng: number, lat: number) {
    return lng >= west && lng <= east && lat >= south && lat <= north;
  }

  switch (name) {
    case "highlight_area": {
      const polygon = args.polygon;
      if (!Array.isArray(polygon) || polygon.length < 3) return false;
      // Every vertex must be inside the city bbox.
      const points: [number, number][] = [];
      for (const pt of polygon) {
        const p = asPoint(pt);
        if (!p || !okLngLat(p[0], p[1])) return false;
        points.push(p);
      }
      // Hard backstop: reject whole-borough / whole-lake blobs. The prompt asks
      // the model to stay focused, but this guarantees it regardless.
      if (polygonAreaKm2(points) > MAX_HIGHLIGHT_KM2) return false;
      return true;
    }
    case "draw_corridor": {
      const from = asPoint(args.from);
      const to = asPoint(args.to);
      return !!(from && to && okLngLat(from[0], from[1]) && okLngLat(to[0], to[1]));
    }
    case "drop_pin": {
      const lng = Number(args.lng);
      const lat = Number(args.lat);
      return okLngLat(lng, lat);
    }
    case "fly_to": {
      const bbox = asBBox(args.bbox);
      if (!bbox) return false;
      return bbox.every((n, i) =>
        i % 2 === 0 ? n >= west && n <= east : n >= south && n <= north,
      );
    }
    default:
      return true;
  }
}
