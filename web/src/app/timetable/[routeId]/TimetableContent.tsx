"use client";

import { use, useEffect, useState } from "react";
import { ROUTES, BUS_ROUTES, type Route } from "~/app/map/transit-data";
import { computeTimetable, formatTime } from "~/lib/timetable";

// ─── types ────────────────────────────────────────────────────────────────────

type Stop = { name: string; coords: [number, number] };
interface StoredData { route: Route; extraStops: Stop[] }

// ─── page ─────────────────────────────────────────────────────────────────────

export default function TimetablePage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = use(params);
  const [stored, setStored] = useState<StoredData | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`timetable-${routeId}`);
    if (raw) {
      try {
        setStored(JSON.parse(raw) as StoredData);
        return;
      } catch { /* fall through */ }
    }
    const route = [...ROUTES, ...BUS_ROUTES].find((r) => r.id === routeId);
    if (route) setStored({ route, extraStops: [] });
  }, [routeId]);

  if (!stored) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50 text-stone-400 text-sm">
        Loading timetable…
      </div>
    );
  }

  const { route, extraStops } = stored;
  const stops = extraStops?.length > 0 ? extraStops : route.stops;
  const tt = computeTimetable(route, stops);

  // Group trip indices by departure hour
  const hourMap = new Map<number, number[]>();
  tt.tripDepartures.forEach((dep, i) => {
    const h = Math.floor(dep / 60) % 24;
    const bucket = hourMap.get(h) ?? [];
    bucket.push(i);
    hourMap.set(h, bucket);
  });
  const hours = [...hourMap.keys()].sort((a, b) => a - b);

  // Default to first hour on load
  const activeHour = selectedHour ?? hours[0] ?? 0;
  const tripIndices = hourMap.get(activeHour) ?? [];

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      {/* ── header ── */}
      <div className="border-b border-stone-200 bg-white px-8 py-5 flex items-center gap-4 shadow-sm">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow"
          style={{ background: route.color, color: route.textColor }}
        >
          {route.shortName}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-stone-800 leading-tight truncate">{route.name}</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            {tt.dayLabel} · {tt.operatingHours} · Every {tt.headwayMinutes} min · {tt.totalTrips} trips · {tt.stops.length} stops
          </p>
        </div>
        <a
          href="/map"
          className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:text-stone-800 hover:border-stone-400 transition-colors"
        >
          ← Back to map
        </a>
      </div>

      {/* ── hour selector ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-8 py-2 flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 text-xs text-stone-400 mr-2">Hour:</span>
        {hours.map((h) => (
          <button
            key={h}
            onClick={() => setSelectedHour(h)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              h === activeHour
                ? "text-white"
                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
            }`}
            style={h === activeHour ? { background: route.color } : {}}
          >
            {String(h).padStart(2, "0")}
          </button>
        ))}
      </div>

      {/* ── timetable ── */}
      <div className="p-8">
        {tt.stops.length < 2 ? (
          <p className="text-sm text-stone-400">No stops defined for this route.</p>
        ) : tripIndices.length === 0 ? (
          <p className="text-sm text-stone-400">No trips in this hour.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  {/* Stop name column header */}
                  <th className="sticky left-0 z-10 bg-stone-50 px-4 py-2.5 text-left font-semibold text-stone-500 border-r border-stone-200 whitespace-nowrap min-w-[160px]">
                    Stop
                  </th>
                  {tripIndices.map((tripIdx) => {
                    const dep = tt.tripDepartures[tripIdx];
                    return (
                      <th
                        key={tripIdx}
                        className="px-3 py-2.5 font-mono font-semibold text-stone-600 text-center whitespace-nowrap border-r border-stone-100 last:border-r-0"
                      >
                        {dep !== undefined ? formatTime(dep) : "—"}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {tt.stops.map((stop, stopIdx) => (
                  <tr
                    key={stopIdx}
                    className={stopIdx % 2 === 0 ? "bg-white" : "bg-stone-50"}
                  >
                    {/* Stop name — sticky left */}
                    <td className={`sticky left-0 z-10 px-4 py-2 border-r border-stone-200 font-medium text-stone-700 whitespace-nowrap ${stopIdx % 2 === 0 ? "bg-white" : "bg-stone-50"}`}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              stopIdx === 0 || stopIdx === tt.stops.length - 1
                                ? route.color
                                : route.color + "88",
                          }}
                        />
                        {stop.stopName}
                      </div>
                    </td>
                    {/* Time cells */}
                    {tripIndices.map((tripIdx) => {
                      const dep = tt.tripDepartures[tripIdx];
                      const arrival = dep !== undefined ? dep + stop.offsetMinutes : null;
                      return (
                        <td
                          key={tripIdx}
                          className="px-3 py-2 font-mono text-stone-600 text-center border-r border-stone-100 last:border-r-0 tabular-nums"
                        >
                          {arrival !== null ? formatTime(arrival) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-stone-400">
          Travel times estimated from haversine distance at average speed for route type. HH:xx columns show all departures in that hour.
        </p>
      </div>
    </div>
  );
}
