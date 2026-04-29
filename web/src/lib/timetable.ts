import type { Route } from "~/app/map/transit-data";

export interface TimetableEntry {
  stopName: string;
  /** Offset from trip departure (stop 0) in minutes, rounded to 1 decimal */
  offsetMinutes: number;
}

export interface TimetableData {
  headwayMinutes: number;
  /** Effective operating hours accounting for midnight wraparound e.g. "05:00–01:00" */
  operatingHours: string;
  days: string[]; // raw days array from servicePattern
  dayLabel: string; // "Daily", "Mon–Fri", "Sat–Sun", "Mon–Sat", or comma-joined abbrevs
  stops: TimetableEntry[];
  /** All trip departure minutes-since-midnight for stop 0 */
  tripDepartures: number[];
  totalTrips: number;
}

const SPEED_KMH: Record<Route["type"], number> = {
  subway: 30,
  lrt: 18,
  streetcar: 15,
  bus: 20,
  go_train: 60,
};

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_ABBREV: Record<(typeof ALL_DAYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtHour(hour: number): string {
  return `${pad2(hour)}:00`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

export function formatTime(minutesSinceMidnight: number): string {
  const rounded = Math.round(minutesSinceMidnight);
  const m = ((rounded % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function dayLabel(days: TimetableData["days"]): string {
  const set = new Set(days);
  const hasAll = ALL_DAYS.every((d) => set.has(d));
  if (hasAll) return "Daily";

  const monFri =
    ["monday", "tuesday", "wednesday", "thursday", "friday"].every((d) =>
      set.has(d),
    ) &&
    !set.has("saturday") &&
    !set.has("sunday");
  if (monFri) return "Mon–Fri";

  const satSun = set.has("saturday") && set.has("sunday") && set.size === 2;
  if (satSun) return "Sat–Sun";

  const monSat =
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].every(
      (d) => set.has(d),
    ) && !set.has("sunday");
  if (monSat) return "Mon–Sat";

  const ordered = ALL_DAYS.filter((d) => set.has(d)).map((d) => DAY_ABBREV[d]);
  return ordered.length > 0 ? ordered.join(", ") : "—";
}

export function computeTimetable(
  route: Route,
  stops?: { name: string; coords: [number, number] }[],
): TimetableData {
  const usedStops =
    stops && stops.length > 0 ? stops : (route.stops ?? []);

  const sp = route.servicePattern;
  const headwayMinutes = sp?.headwayMinutes ?? 5;
  const startHour = sp?.startHour ?? 6;
  const endHour = sp?.endHour ?? 24;
  const days = (sp?.days ?? [...ALL_DAYS]) as TimetableData["days"];

  const effectiveEndHour = endHour < startHour ? endHour + 24 : endHour;
  const startMin = startHour * 60;
  const endMin = effectiveEndHour * 60;

  const tripDepartures: number[] = [];
  if (headwayMinutes > 0) {
    for (let t = startMin; t < endMin; t += headwayMinutes) tripDepartures.push(t);
  }

  const speedKmh = SPEED_KMH[route.type];
  const speedMs = (speedKmh * 1000) / 3600;

  const entries: TimetableEntry[] = [];
  let elapsedMinutes = 0;

  for (let i = 0; i < usedStops.length; i++) {
    const stop = usedStops[i];
    if (!stop) continue;
    if (i > 0) {
      const prev = usedStops[i - 1];
      if (prev) {
        const distM = haversineKm(prev.coords, stop.coords) * 1000;
        const minutes = speedMs > 0 ? distM / speedMs / 60 : 0;
        elapsedMinutes += minutes;
      }
    }
    entries.push({ stopName: stop.name, offsetMinutes: round1(elapsedMinutes) });
  }

  return {
    headwayMinutes,
    operatingHours: `${fmtHour(startHour)}–${fmtHour(endHour)}`,
    days,
    dayLabel: dayLabel(days),
    stops: entries,
    tripDepartures,
    totalTrips: tripDepartures.length,
  };
}

