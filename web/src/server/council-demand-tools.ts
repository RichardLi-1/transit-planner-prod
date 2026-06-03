import "server-only";

import type { ToolDefinition } from "./ai-provider";
import type { ExistingStop } from "./council";
import { supabase } from "./supabase";
import { haversineKm } from "~/app/map/geo-utils";

// ── Why this file exists ─────────────────────────────────────────────────────
// Root cause #1 of "random" routes: planners were asked to invent stop
// coordinates from the model's fuzzy memory of Toronto. This module gives them
// a read-only `query_demand` tool so they can look up *real* census population
// (with real coordinates) and the *real* nearest existing TTC stops before
// placing a stop — grounding their proposals in data instead of recall.
//
// 📖 Learn: this is "tool-augmented generation" / retrieval. Rather than stuff
// all demand data into the prompt (expensive, and the model still has to find
// the relevant bit), we let the model *ask* for the slice it needs, mid-reasoning.

// The tool the planners may call (shared JSON-Schema shape; the provider maps it
// to Anthropic tool-use / Gemini function-calling).
export const QUERY_DEMAND_TOOL: ToolDefinition = {
  name: "query_demand",
  description:
    "Look up real census population and the nearest existing TTC stops around a point. " +
    "Call this before placing a stop so its coordinates land on actual demand, not a guess. " +
    "Returns total population in the radius, the densest census blocks (with exact coordinates " +
    "you can anchor a stop to), and nearby existing stations (for transfers / the 800 m rule).",
  inputSchema: {
    type: "object",
    properties: {
      near: {
        type: "array",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
        description: "[longitude, latitude] centre point to investigate (Toronto: lon -79.65..-79.10, lat 43.55..43.85).",
      },
      radiusKm: {
        type: "number",
        description: "Search radius in km (default 1.5). Use ~0.8 to check a single stop, ~3 to scan a corridor.",
      },
    },
    required: ["near"],
  },
};

export const DEMAND_TOOLS: ToolDefinition[] = [QUERY_DEMAND_TOOL];

// What the handler returns to the model (kept compact — it goes back into the
// context window as a tool_result on every call).
interface DemandResult {
  center: [number, number];
  radiusKm: number;
  totalPopulation: number;
  blockCount: number;
  // Densest real census blocks in the radius — these are the coordinates a
  // planner should snap a stop to if it wants to maximise population served.
  densestPoints: Array<{ coords: [number, number]; population: number }>;
  // Nearby existing TTC stops — for transfer placement and the 800 m spacing rule.
  nearestExistingStops: Array<{ name: string; route: string; distanceM: number }>;
  note?: string;
}

type PopBlock = { longitude: number; latitude: number; population: number };

// 📖 Learn: a "degree box" pre-filter. Querying every census row and computing
// Haversine on all of them is wasteful, so we first clip to a lon/lat rectangle
// (cheap, index-friendly inequality filters in Postgres) that comfortably
// contains the radius, then do the precise circular distance test in JS.
function boundingBox(
  [lon, lat]: [number, number],
  radiusKm: number,
): { west: number; south: number; east: number; north: number } {
  const latDeg = radiusKm / 111; // ~111 km per degree of latitude everywhere
  // Degrees of longitude per km shrink with latitude (cos), so divide it out.
  const lonDeg = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { west: lon - lonDeg, south: lat - latDeg, east: lon + lonDeg, north: lat + latDeg };
}

/**
 * Execute a council demand tool. Async because it hits Supabase. `existingLines`
 * is passed in by the caller (the graph node closes over council state).
 */
export async function handleDemandTool(
  name: string,
  args: Record<string, unknown>,
  existingLines: ExistingStop[],
): Promise<DemandResult | { error: string }> {
  if (name !== "query_demand") return { error: `Unknown tool: ${name}` };

  const near = args.near as [number, number] | undefined;
  if (!Array.isArray(near) || near.length !== 2 || near.some((n) => typeof n !== "number")) {
    return { error: "query_demand requires `near` as [longitude, latitude]." };
  }
  // Clamp radius to a sane range so a bad value can't pull the whole table.
  const radiusKm = Math.min(5, Math.max(0.3, typeof args.radiusKm === "number" ? args.radiusKm : 1.5));
  const box = boundingBox(near, radiusKm);

  const { data, error } = await supabase
    .from("pop_data")
    .select("longitude, latitude, population")
    .gte("latitude", box.south).lte("latitude", box.north)
    .gte("longitude", box.west).lte("longitude", box.east)
    .gt("population", 0)
    .order("population", { ascending: false })
    .limit(2000);

  // Nearest existing stops are computed regardless of whether pop_data succeeds —
  // they come from in-memory council state, so they're always available.
  const nearestExistingStops = existingLines
    .map((s) => ({ name: s.name, route: s.route, distanceM: Math.round(haversineKm(near, s.coords) * 1000) }))
    .filter((s) => s.distanceM <= radiusKm * 1000)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);

  if (error || !data) {
    return {
      center: near,
      radiusKm,
      totalPopulation: 0,
      blockCount: 0,
      densestPoints: [],
      nearestExistingStops,
      note: "Population data unavailable; rely on nearby existing stops and your Toronto knowledge.",
    };
  }

  // Precise circular filter (the bbox above was just a coarse pre-clip).
  const inRadius = (data as PopBlock[]).filter(
    (r) => haversineKm(near, [r.longitude, r.latitude]) <= radiusKm,
  );

  const totalPopulation = inRadius.reduce((sum, r) => sum + r.population, 0);
  const densestPoints = inRadius
    .slice(0, 8) // already ordered by population desc from the query
    .map((r) => ({ coords: [r.longitude, r.latitude] as [number, number], population: Math.round(r.population) }));

  return {
    center: near,
    radiusKm,
    totalPopulation: Math.round(totalPopulation),
    blockCount: inRadius.length,
    densestPoints,
    nearestExistingStops,
  };
}
