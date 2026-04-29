/**
 * GTFS export utility.
 *
 * Converts Route objects into a map of GTFS filename → CSV string.
 * The caller zips those up (jszip) and triggers a browser download.
 *
 * ── Timetable synthesis ──────────────────────────────────────────────────────
 * Real departure times are generated from each route's servicePattern:
 *   - One trip every headwayMinutes, from startHour to endHour.
 *   - Travel time between stops is estimated from haversine distance ÷ assumed
 *     average speed for the route type (see SPEED_KMH below).  This bakes in
 *     acceleration, signal delays, and dwell time as a single average figure —
 *     good enough for a planning feed.
 *   - GTFS allows times past midnight (e.g. "25:30:00"), so no special casing
 *     is needed for routes that run into the early morning.
 *
 * Routes without a servicePattern fall back to a sensible default (every 5 min,
 * 06:00–24:00, daily).
 */

import type { Route } from "~/app/map/transit-data";

// ─── types ────────────────────────────────────────────────────────────────────

export type GTFSFiles = Record<string, string>;

type CsvRow = Record<string, string | number>;

// ─── speed assumptions (km/h, average including stops + signals) ─────────────

const SPEED_KMH: Record<Route["type"], number> = {
  subway:    30,
  lrt:       18,
  streetcar: 15,
  bus:       20,
  go_train:  60,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a CSV string from an array of uniform objects. */
function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = String(row[h] ?? "");
          return v.includes(",") || v.includes('"')
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Format integer seconds-since-midnight as HH:MM:SS.
 * Intentionally allows values ≥ 86400 (e.g. 90000 → "25:00:00") because GTFS
 * uses this convention for service that continues past midnight.
 */
function fmtSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Great-circle distance in km between two [lng, lat] points. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

/**
 * Stable stop_id for a stop.
 * Prefers the stop's own `id` field; falls back to coordinate-derived key so
 * the same physical location on different routes maps to the same stop_id.
 */
function stopKey(stop: {
  id?: string;
  name: string;
  coords: [number, number];
}): string {
  if (stop.id) return stop.id;
  return `stop_${stop.coords[1].toFixed(5)}_${stop.coords[0].toFixed(5)}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
}

/** Map our route type to the GTFS route_type integer. */
function gtfsRouteType(type: Route["type"]): number {
  switch (type) {
    case "subway":    return 1;
    case "lrt":       return 0;
    case "streetcar": return 900;
    case "bus":       return 3;
    case "go_train":  return 2;   // Rail
  }
}

/**
 * Derive a calendar service_id from a route's ServicePattern.
 * We emit three calendar rows (everyday / weekday / weekend) and pick the
 * best match rather than creating a unique row per route.
 */
function serviceId(route: Route): string {
  const sp = route.servicePattern;
  if (!sp) return "everyday";
  const hasSat = sp.days.includes("saturday");
  const hasMon = sp.days.includes("monday");
  if (hasMon && hasSat) return "everyday";
  if (hasSat) return "weekend";
  return "weekday";
}

/**
 * Precompute cumulative arrival times (in seconds from t=0) at each stop.
 *
 * The model: vehicle departs stop[0] at t=0.  Travel time between consecutive
 * stops = haversine_km / speed_km_per_s.  Arrival at stop[i] = departure from
 * stop[i-1] + travel time.  We record *arrival* at each stop; departure from
 * the same stop is implicitly arrival + a small dwell that's already baked into
 * the speed constant so we don't double-count.
 *
 * Returns an array of arrival times in seconds, indexed by stop sequence.
 */
function computeArrivalOffsets(
  stops: { coords: [number, number] }[],
  type: Route["type"],
): number[] {
  const speedMs = (SPEED_KMH[type] * 1000) / 3600; // km/h → m/s
  const offsets = [0];
  let elapsed = 0;
  for (let i = 1; i < stops.length; i++) {
    const distM = haversineKm(stops[i - 1]!.coords, stops[i]!.coords) * 1000;
    elapsed += distM / speedMs;
    offsets.push(elapsed);
  }
  return offsets;
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Generate all GTFS files for the given routes.
 *
 * @param routes  All routes to include. Stops are taken directly from each route.
 */
export function generateGTFS(routes: Route[]): GTFSFiles {
  const resolved = routes;

  // ── 2. agency.txt ─────────────────────────────────────────────────────────
  const agencyRows: CsvRow[] = [
    {
      agency_id:       "1",
      agency_name:     "Transit Planner",
      agency_url:      "https://transit-planner.app",
      agency_timezone: "America/Toronto",
      agency_lang:     "en",
    },
  ];

  // ── 3. calendar.txt ───────────────────────────────────────────────────────
  // Three generic service calendars cover the vast majority of TTC patterns.
  const calendarRows: CsvRow[] = [
    { service_id: "everyday", monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: "20240101", end_date: "20261231" },
    { service_id: "weekday",  monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, start_date: "20240101", end_date: "20261231" },
    { service_id: "weekend",  monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 1, sunday: 1, start_date: "20240101", end_date: "20261231" },
  ];

  // ── 4. routes.txt ─────────────────────────────────────────────────────────
  const routeRows: CsvRow[] = resolved.map((r) => ({
    route_id:         r.id,
    agency_id:        "1",
    route_short_name: r.shortName,
    route_long_name:  r.name,
    route_desc:       r.description,
    route_type:       gtfsRouteType(r.type),
    route_color:      r.color.replace("#", "").toUpperCase(),
    route_text_color: r.textColor.replace("#", "").toUpperCase(),
  }));

  // ── 5. stops.txt (deduplicated across all routes) ─────────────────────────
  // Stops are keyed by coordinate so transfer stations (same lat/lon on two
  // routes) get a single stop_id — which is what GTFS consumers expect.
  const stopMap = new Map<string, CsvRow>();

  for (const r of resolved) {
    for (const stop of r.stops) {
      const id = stopKey(stop);
      if (!stopMap.has(id)) {
        stopMap.set(id, {
          stop_id:   id,
          stop_name: stop.name,
          stop_lat:  stop.coords[1],
          stop_lon:  stop.coords[0],
        });
      }
    }
  }

  const stopRows = [...stopMap.values()];

  // ── 6. trips.txt + stop_times.txt + shapes.txt ────────────────────────────
  const tripRows:     CsvRow[] = [];
  const stopTimeRows: CsvRow[] = [];
  const shapeRows:    CsvRow[] = [];

  for (const r of resolved) {
    if (r.stops.length < 2) continue; // skip degenerate routes

    const sid          = serviceId(r);
    const headway      = r.servicePattern?.headwayMinutes ?? 5;
    const startHour    = r.servicePattern?.startHour ?? 6;
    const rawEndHour   = r.servicePattern?.endHour ?? 24;
    // endHour ≤ startHour means the service runs past midnight (e.g. 5→1 = 5am to 1am next day)
    const endHour      = rawEndHour <= startHour ? rawEndHour + 24 : rawEndHour;
    const headsign     = r.stops[r.stops.length - 1]?.name ?? r.name;
    const arrivalOffsets = computeArrivalOffsets(r.stops, r.type);

    // Generate one trip per headway slot
    let tripIndex = 0;
    for (
      let depMin = startHour * 60;
      depMin < endHour * 60;
      depMin += headway
    ) {
      const tripId = `${r.id}-t${tripIndex++}`;
      const depSec = depMin * 60;

      tripRows.push({
        route_id:      r.id,
        service_id:    sid,
        trip_id:       tripId,
        trip_headsign: headsign,
        direction_id:  0,
        shape_id:      r.shape ? r.id : r.id, // always reference the shape
      });

      for (let i = 0; i < r.stops.length; i++) {
        const stop     = r.stops[i]!;
        const id       = stopKey(stop);
        const arrSec   = depSec + arrivalOffsets[i]!;
        const timeStr  = fmtSec(arrSec);

        stopTimeRows.push({
          trip_id:        tripId,
          arrival_time:   timeStr,
          departure_time: timeStr,
          stop_id:        id,
          stop_sequence:  i + 1,
          pickup_type:    i === r.stops.length - 1 ? 1 : 0, // no pickup at last stop
          drop_off_type:  i === 0 ? 1 : 0,                  // no drop-off at first stop
        });
      }
    }

    // shapes.txt — use explicit shape waypoints when present, else stop coords
    const shapePoints: [number, number][] =
      r.shape ?? r.stops.map((s) => s.coords);

    for (let i = 0; i < shapePoints.length; i++) {
      const [lon, lat] = shapePoints[i]!;
      shapeRows.push({
        shape_id:          r.id,
        shape_pt_lat:      lat,
        shape_pt_lon:      lon,
        shape_pt_sequence: i + 1,
      });
    }
  }

  // ── 7. Assemble ───────────────────────────────────────────────────────────
  return {
    "agency.txt":     toCsv(agencyRows),
    "calendar.txt":   toCsv(calendarRows),
    "routes.txt":     toCsv(routeRows),
    "stops.txt":      toCsv(stopRows),
    "trips.txt":      toCsv(tripRows),
    "stop_times.txt": toCsv(stopTimeRows),
    "shapes.txt":     toCsv(shapeRows),
  };
}
