import { NextResponse, type NextRequest } from "next/server";
import { transit_realtime } from "gtfs-realtime-bindings";

export const revalidate = 300; // 5-minute Next.js cache

const TTC_TRIP_UPDATES_URL = "https://bustime.ttc.ca/gtfsrt/tripupdates";

// TTC GTFS route ID → simulation route type
const SUBWAY_IDS    = new Set(["1", "2", "4"]);
const STREETCAR_IDS = new Set(["501", "503", "504", "505", "506", "509", "510", "511", "512", "514"]);
// LRT not yet operating in GTFS-RT (Finch West / Eglinton not open)
// All other numeric IDs → bus

type RouteType = "subway" | "lrt" | "streetcar" | "bus" | "go_train";

export interface TransitSpeedData {
  speeds:            Record<RouteType, number>;
  boardingPenalties: Record<RouteType, number>;
  liveHeadways:      Record<RouteType, number | null>;
  routeCounts:       Record<RouteType, number>;
  isLive:            boolean;
  source:            "live" | "fallback";
  updatedAt:         number;
  tripCount:         number;
}

// Hardcoded fallback values matching simulation.ts SPEED / BOARD_PENALTY constants
const FALLBACK_SPEEDS: Record<RouteType, number> = {
  subway:    35,
  lrt:       25,
  streetcar: 15,
  bus:       20,
  go_train:  60,
};

const FALLBACK_PENALTIES: Record<RouteType, number> = {
  subway:    2,
  lrt:       2.5,
  streetcar: 3,
  bus:       4,
  go_train:  5,
};

// Maximum boarding penalty caps per type (half-headway model)
const PENALTY_CAPS: Record<RouteType, number> = {
  subway:    4,
  lrt:       5,
  streetcar: 5,
  bus:       8,
  go_train:  8,
};

function buildFallback(): TransitSpeedData {
  return {
    speeds:            { ...FALLBACK_SPEEDS },
    boardingPenalties: { ...FALLBACK_PENALTIES },
    liveHeadways:      { subway: null, lrt: null, streetcar: null, bus: null, go_train: null },
    routeCounts:       { subway: 0,    lrt: 0,    streetcar: 0,    bus: 0,    go_train: 0 },
    isLive:            false,
    source:            "fallback",
    updatedAt:         Date.now(),
    tripCount:         0,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<TransitSpeedData>> {
  const { searchParams } = req.nextUrl;
  let startMin = Math.max(0, Math.min(1440, parseInt(searchParams.get("start_min") ?? "0",   10) || 0));
  let endMin   = Math.max(0, Math.min(1440, parseInt(searchParams.get("end_min")   ?? "1440", 10) || 1440));
  if (startMin > endMin) [startMin, endMin] = [endMin, startMin];

  try {
    const res = await fetch(TTC_TRIP_UPDATES_URL, {
      next: { revalidate: 300, tags: ["gtfs-rt-trip-updates"] },
      headers: { Accept: "application/x-google-protobuf" },
    });

    if (!res.ok) {
      console.warn(`[transit-speeds] GTFS-RT returned ${res.status}, using fallback`);
      return NextResponse.json(buildFallback());
    }

    const buffer = await res.arrayBuffer();
    const feed   = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    const data = computeSpeedData(feed, startMin, endMin);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.warn("[transit-speeds] fetch/decode error, using fallback:", err);
    return NextResponse.json(buildFallback());
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function routeTypeForId(routeId: string): RouteType | null {
  if (SUBWAY_IDS.has(routeId))    return "subway";
  if (STREETCAR_IDS.has(routeId)) return "streetcar";
  if (/^\d+$/.test(routeId))      return "bus";
  return null;
}

/** Parse "HH:MM:SS" (including extended 24:xx:xx / 25:xx:xx) to minutes since midnight. */
function parseStartTime(t: string): number {
  const parts = t.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return Math.min(1440, h * 60 + m);
}

/**
 * Time-of-day speed multiplier for road-surface transit (bus / streetcar).
 * Subway/LRT/GO are grade-separated — multiplier is always 1.0 for those.
 */
function roadSpeedMultiplier(midpointMin: number): number {
  if (midpointMin <  360) return 1.10; // overnight (midnight–6am): minimal congestion
  if (midpointMin <  420) return 0.95; // early AM ramp (6–7am)
  if (midpointMin <  570) return 0.75; // AM peak (7–9:30am)
  if (midpointMin <  870) return 0.90; // midday (9:30am–2:30pm)
  if (midpointMin <  930) return 0.85; // pre-PM shoulder (2:30–3:30pm)
  if (midpointMin < 1110) return 0.72; // PM peak (3:30–6:30pm)
  return 0.88;                          // evening (6:30pm–midnight)
}

function computeSpeedData(
  feed: transit_realtime.FeedMessage,
  startMin: number,
  endMin: number,
): TransitSpeedData {
  const isFullDay = startMin === 0 && endMin === 1440;
  const midpoint  = Math.floor((startMin + endMin) / 2);
  const roadMult  = isFullDay ? 1.0 : roadSpeedMultiplier(midpoint);

  // Collect trip start times per route type within the window
  const buckets: Record<RouteType, number[]> = {
    subway: [], lrt: [], streetcar: [], bus: [], go_train: [],
  };
  let tripCount = 0;

  const seen = new Set<string>();
  for (const entity of feed.entity) {
    const trip = entity.tripUpdate?.trip;
    if (!trip?.routeId || !trip.startTime) continue;

    // Deduplicate: same trip can appear multiple times in GTFS-RT feeds
    const tripKey = `${trip.routeId}|${trip.tripId ?? ""}|${trip.startTime}`;
    if (seen.has(tripKey)) continue;
    seen.add(tripKey);

    const type = routeTypeForId(trip.routeId);
    if (!type) continue;

    const startMinute = parseStartTime(trip.startTime);
    // Include trips within an hour of the window edges
    if (startMinute < startMin - 60 || startMinute > endMin + 60) continue;

    buckets[type].push(startMinute);
    tripCount++;
  }

  // Compute median headway per type (require ≥3 trips for stability)
  const liveHeadways: Record<RouteType, number | null> = {
    subway: null, lrt: null, streetcar: null, bus: null, go_train: null,
  };

  for (const type of Object.keys(buckets) as RouteType[]) {
    const times = buckets[type].sort((a, b) => a - b);
    if (times.length < 3) continue;
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const g = times[i]! - times[i - 1]!;
      // Exclude gaps > 60 min — likely service gaps between runs, not true headways
      if (g > 0 && g <= 60) gaps.push(g);
    }
    if (gaps.length < 2) continue;
    gaps.sort((a, b) => a - b);
    liveHeadways[type] = gaps[Math.floor(gaps.length / 2)]!;
  }

  // Build speeds and boarding penalties
  const speeds:            Record<RouteType, number> = { ...FALLBACK_SPEEDS };
  const boardingPenalties: Record<RouteType, number> = { ...FALLBACK_PENALTIES };
  const roadTypes: RouteType[] = ["streetcar", "bus"];

  for (const type of roadTypes) {
    speeds[type] = +(FALLBACK_SPEEDS[type] * roadMult).toFixed(1);
  }

  for (const type of Object.keys(liveHeadways) as RouteType[]) {
    const hw = liveHeadways[type];
    if (hw !== null) {
      boardingPenalties[type] = +Math.min(hw / 2, PENALTY_CAPS[type]).toFixed(1);
    }
  }

  const routeCounts = Object.fromEntries(
    (Object.keys(buckets) as RouteType[]).map((t) => [t, buckets[t].length]),
  ) as Record<RouteType, number>;

  // Require at least 10 trips across all types before reporting as "live"
  // to avoid spurious live labels during off-peak hours with very sparse data
  const isLive = tripCount >= 10;

  return {
    speeds,
    boardingPenalties,
    liveHeadways,
    routeCounts,
    isLive,
    source:    isLive ? "live" : "fallback",
    updatedAt: Date.now(),
    tripCount,
  };
}
