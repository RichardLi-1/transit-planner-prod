import "server-only";

import { haversineKm } from "~/app/map/geo-utils";
import {
  ROUTES,
  BUS_ROUTES,
  GO_TRAIN_ROUTES,
  type Route,
} from "~/app/map/transit-data";
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
      return polygon.every((pt) => {
        const p = asPoint(pt);
        return p ? okLngLat(p[0], p[1]) : false;
      });
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
