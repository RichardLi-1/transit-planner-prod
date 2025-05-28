"use client";

import { useEffect, useState } from "react";
import type { Route } from "~/app/map/transit-data";

function parseHeadway(frequency: string, servicePattern?: Route["servicePattern"]): number {
  if (servicePattern?.headwayMinutes) return servicePattern.headwayMinutes;
  const range = frequency.match(/(\d+)[–\-](\d+)/);
  if (range) return (parseInt(range[1]!) + parseInt(range[2]!)) / 2;
  const single = frequency.match(/(\d+)\s*min/i);
  if (single) return parseInt(single[1]!);
  return 30;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function scoreStation(
  stopName: string,
  route: Route,
  allRoutes: Route[],
  stationPopulations: Map<string, number>,
) {
  const headway = parseHeadway(route.frequency, route.servicePattern);
  const frequency = Math.max(0, Math.min(100, Math.round(100 - headway * 2)));

  const transferCount = allRoutes.filter(
    (r) => r.id !== route.id && r.stops.some((s) => s.name === stopName),
  ).length;
  const connectivity = Math.min(100, transferCount * 33 + (transferCount > 0 ? 1 : 0));

  const rawPop = stationPopulations.get(stopName);
  const allPops = [...stationPopulations.values()].filter((v) => v > 0);
  let demand = 50;
  if (rawPop !== undefined && allPops.length > 0) {
    const maxPop = Math.max(...allPops);
    demand = Math.min(100, Math.round((rawPop / maxPop) * 100));
  }

  const overall = Math.round((frequency + connectivity + demand) / 3);
  const grade =
    overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 45 ? "D" : "F";
  return { frequency, connectivity, demand, overall, grade };
}

function scoreRoute(route: Route, allRoutes: Route[]) {
  const headway = parseHeadway(route.frequency, route.servicePattern);
  const frequency = Math.max(0, Math.min(100, Math.round(100 - headway * 2)));
  const stopCount = route.stops.length;
  const coverage = Math.min(100, stopCount * 3);
  const otherStops = allRoutes.filter((r) => r.id !== route.id).flatMap((r) => r.stops.map((s) => s.coords));
  const connectedCount = route.stops.filter((s) => otherStops.some((os) => haversineKm(s.coords, os) < 0.5)).length;
  const connectivity = stopCount > 0 ? Math.min(100, Math.round((connectedCount / stopCount) * 100)) : 0;
  let totalPath = 0;
  for (let i = 1; i < route.stops.length; i++) totalPath += haversineKm(route.stops[i - 1]!.coords, route.stops[i]!.coords);
  const straightLine = route.stops.length >= 2 ? haversineKm(route.stops[0]!.coords, route.stops[route.stops.length - 1]!.coords) : 0;
  const efficiency = totalPath > 0 ? Math.min(100, Math.round((straightLine / totalPath) * 150)) : 50;
  const overall = Math.round((frequency + coverage + connectivity + efficiency) / 4);
  const grade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 45 ? "D" : "F";
  return { frequency, coverage, connectivity, efficiency, overall, grade };
}

export function RoutePanel({
  route,
  selectedStop,
  stationPopulations,
  onDeleteStop,
  onDeleteLine,
  onSnapToRoads,
  onAddPortal,
  onClose,
  allRoutes = [],
  pedestrianConnections = [],
}: {
  route: Route;
  selectedStop: string | null;
  stationPopulations: Map<string, number>;
  onDeleteStop: (name: string) => void;
  onDeleteLine?: () => void;
  /** Called when the user requests road-snapping. Resolves when done, throws on error. */
  onSnapToRoads?: () => Promise<void>;
  /** Called when the user wants to enter portal placement mode. */
  onAddPortal?: () => void;
  onClose: () => void;
  allRoutes?: Route[];
  pedestrianConnections?: { route: Route; stopName: string }[];
}) {
  const [snapState, setSnapState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [snapError, setSnapError] = useState<string | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedRoutes(new Set());
  }, [selectedStop, route.id]);

  function toggleRouteSection(routeId: string) {
    setExpandedRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }
  const routeScore = !selectedStop && allRoutes.length > 0 ? scoreRoute(route, allRoutes) : null;
  const stationScore =
    selectedStop && allRoutes.length > 0
      ? scoreStation(selectedStop, route, allRoutes, stationPopulations)
      : null;
  const rawPop = selectedStop ? stationPopulations.get(selectedStop) : undefined;
  const popServed = rawPop !== undefined ? Math.max(2314, rawPop) : undefined;
  const allStops = route.stops;
  const isCustomLine = !!onDeleteLine;

  // Routes (other than this one) that share the selected stop — used for transfer indicators
  const transferRoutes = selectedStop
    ? allRoutes.filter((r) => r.id !== route.id && r.stops.some((s) => s.name === selectedStop))
    : [];

  // Set of stop names that are transfer nodes (shared with any other route)
  const transferStopNames = new Set(
    allStops
      .filter((s) => allRoutes.some((r) => r.id !== route.id && r.stops.some((os) => os.name === s.name)))
      .map((s) => s.name)
  );

  return (
    <div className="pointer-events-auto flex h-full w-80 flex-col overflow-hidden rounded-2xl bg-white" style={{ border: "0.93px solid #BEB7B4" }}>
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          {transferRoutes.length > 0 ? (
            // 📖 Learn: Tailwind grid-cols-3 — a fixed 3-column grid makes the
            // route badges wrap into rows (a grid) once there are >3, so the
            // cluster grows downward at a stable width instead of one long
            // shrink-0 row that squeezes the station title into wrapping.
            <div className="grid shrink-0 grid-cols-3 gap-1">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: route.color, color: route.textColor }}
              >
                {route.shortName}
              </span>
              {transferRoutes.map((r) => (
                <span
                  key={r.id}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: r.color, color: r.textColor }}
                >
                  {r.shortName}
                </span>
              ))}
            </div>
          ) : (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold"
              style={{ background: route.color, color: route.textColor }}
            >
              {route.shortName}
            </span>
          )}
          <div>
            {selectedStop && (
              <p className="text-xs font-medium text-stone-500">
                {transferRoutes.length > 0
                  ? `Transfer: ${[route, ...transferRoutes].map((r) => `Line ${r.shortName}`).join(" · ")}`
                  : route.name}
              </p>
            )}
            <h2 className="text-lg font-bold leading-tight text-stone-800">{selectedStop ?? route.name}</h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {selectedStop && popServed !== undefined && (
        <div className="mx-5 mt-0 rounded-xl bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold text-stone-500">Population Served{transferRoutes.length > 0 ? " (combined)" : ""}</p>
          <p className="mt-1 text-2xl font-bold text-stone-800">{popServed.toLocaleString()}</p>
          <p className="text-[11px] text-stone-400">Nearest-station assignment, {route.type === "streetcar" || route.type === "bus" ? "1" : "5"} km cutoff</p>
        </div>
      )}

      <div className="px-5 pt-4 pb-0">
        {!selectedStop && (
          <p className="text-sm leading-relaxed text-stone-500">{route.description}</p>
        )}
        <p className={`${selectedStop ? "" : "mt-2 "}text-xs font-medium text-stone-400`}>
          Frequency: <span className="text-stone-600">{route.frequency}</span>
        </p>
      </div>

      {/* Lines at this station — shown when the selected stop is a transfer */}
      {selectedStop && transferRoutes.length > 0 && (
        <div className="mx-5 mt-3 rounded-xl bg-stone-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-stone-500">Lines at this station</p>
          {[route, ...transferRoutes].map((r) => (
            <div key={r.id} className="mb-1.5 flex items-center gap-2.5 last:mb-0">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: r.color, color: r.textColor }}
              >
                {r.shortName}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-stone-700">{r.name}</p>
                <p className="text-[10px] text-stone-400">
                  {r.frequency} · {r.stops.length} stops
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {pedestrianConnections.length > 0 && (
        <div className="mx-5 mt-3 rounded-xl border border-stone-200 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="2" r="1" fill="currentColor" stroke="none"/>
              <path d="M6 4v3l-1.5 2M6 7l1.5 2M4.5 5.5h3"/>
            </svg>
            Same station — pedestrian walkway
          </p>
          {pedestrianConnections.map(({ route: r, stopName }) => (
            <div key={r.id} className="flex items-center gap-2 text-sm text-stone-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: r.color, color: r.textColor }}>{r.shortName}</span>
              <span>{stopName}</span>
              <span className="ml-auto text-xs text-stone-400">by foot</span>
            </div>
          ))}
        </div>
      )}

      {/* Timetable — opens full page in new tab */}
      <div className="mx-5 mt-4">
        <button
          onClick={() => {
            sessionStorage.setItem(
              `timetable-${route.id}`,
              JSON.stringify({ route }),
            );
            window.open(`/timetable/${route.id}`, "_blank");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2 text-xs font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors"
        >
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="5" /><path d="M6 3v3l2 1.5" />
          </svg>
          View timetable
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 opacity-40" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1h4v4M11 1L5 7M4 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8" />
          </svg>
        </button>
      </div>

      {onSnapToRoads && (
        <div className="mx-5 mt-3">
          <button
            disabled={snapState === "loading"}
            onClick={() => {
              setSnapState("loading");
              setSnapError(null);
              onSnapToRoads()
                .then(() => setSnapState("done"))
                .catch((err: unknown) => {
                  setSnapState("error");
                  setSnapError(err instanceof Error ? err.message : "Snap failed.");
                });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2 text-xs font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {snapState === "loading" ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1v2M6 9v2M1 6h2M9 6h2" strokeLinecap="round"/>
                </svg>
                Snapping…
              </>
            ) : (
              <>
                <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10 C3 7 5 6 6 6 C7 6 9 5 10 2"/><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/>
                </svg>
                {snapState === "done" ? "Snapped to roads ✓" : "Snap to roads"}
              </>
            )}
          </button>
          {snapState === "error" && snapError && (
            <p className="mt-1.5 text-xs text-red-500 leading-snug">{snapError}</p>
          )}
        </div>
      )}

      {onAddPortal && (
        <div className="mx-5 mt-3">
          <button
            onClick={onAddPortal}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2 text-xs font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors"
          >
            <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9 C2 5 4 3 6 3 C8 3 10 5 10 9"/>
              <path d="M4 9 C4 6.5 5 5.5 6 5.5 C7 5.5 8 6.5 8 9"/>
            </svg>
            Add portal
          </button>
        </div>
      )}

      {isCustomLine && selectedStop && (
        <div className="mx-5 mt-4">
          <button
            onClick={() => onDeleteStop(selectedStop)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor">
              <path fillRule="evenodd" d="M6 1a1.75 1.75 0 0 0-1.736 1.502H2.75a.75.75 0 0 0 0 1.5h.148l.465 6.52A1.75 1.75 0 0 0 5.11 12h3.78a1.75 1.75 0 0 0 1.747-1.478l.465-6.52h.148a.75.75 0 0 0 0-1.5H9.736A1.75 1.75 0 0 0 8 1H6Zm1 1.5a.25.25 0 0 0-.247.215L6.5 2.5h1l-.253-.285A.25.25 0 0 0 7 2.5Zm-1.5 3a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Zm2.5 0a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Z" clipRule="evenodd"/>
            </svg>
            Delete stop
          </button>
        </div>
      )}
      {onDeleteLine && !selectedStop && (
        <div className="mx-5 mt-4">
          <button
            onClick={onDeleteLine}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor">
              <path fillRule="evenodd" d="M6 1a1.75 1.75 0 0 0-1.736 1.502H2.75a.75.75 0 0 0 0 1.5h.148l.465 6.52A1.75 1.75 0 0 0 5.11 12h3.78a1.75 1.75 0 0 0 1.747-1.478l.465-6.52h.148a.75.75 0 0 0 0-1.5H9.736A1.75 1.75 0 0 0 8 1H6Zm1 1.5a.25.25 0 0 0-.247.215L6.5 2.5h1l-.253-.285A.25.25 0 0 0 7 2.5Zm-1.5 3a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Zm2.5 0a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Z" clipRule="evenodd"/>
            </svg>
            Delete line
          </button>
        </div>
      )}

      {(stationScore ?? routeScore) && (
        <div className="border-t border-stone-100 px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {stationScore ? "Station Score" : "Route Score"}
            </p>
            <div className="flex items-center gap-2">
              {(() => {
                const s = stationScore ?? routeScore!;
                return (
                  <>
                    <span
                      className={`text-lg font-black leading-none ${s.grade === "A" ? "text-emerald-600" : s.grade === "B" ? "text-sky-600" : s.grade === "C" ? "text-amber-600" : "text-rose-600"}`}
                    >
                      {s.grade}
                    </span>
                    <span className="text-sm font-bold text-stone-700">
                      {s.overall}
                      <span className="text-[10px] font-normal text-stone-400">/100</span>
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="space-y-1.5">
            {stationScore
              ? (
                  [
                    ["Demand", stationScore.demand, "population"],
                    ["Connectivity", stationScore.connectivity, "transfers"],
                    ["Frequency", stationScore.frequency, `${Math.round(parseHeadway(route.frequency, route.servicePattern))} min`],
                  ] as [string, number, string][]
                ).map(([label, val, hint]) => (
                  <div key={label}>
                    <div className="mb-0.5 flex items-baseline justify-between">
                      <span className="text-[11px] text-stone-500">
                        {label} <span className="text-[9px] text-stone-300">{hint}</span>
                      </span>
                      <span className="text-[11px] font-semibold text-stone-700">{val}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-stone-400" style={{ width: `${val}%` }} />
                    </div>
                  </div>
                ))
              : (
                  [
                    ["Frequency", routeScore!.frequency, `${Math.round(parseHeadway(route.frequency, route.servicePattern))} min`],
                    ["Coverage", routeScore!.coverage, `${route.stops.length} stops`],
                    ["Connectivity", routeScore!.connectivity, "transfers"],
                    ["Efficiency", routeScore!.efficiency, "alignment"],
                  ] as [string, number, string][]
                ).map(([label, val, hint]) => (
                  <div key={label}>
                    <div className="mb-0.5 flex items-baseline justify-between">
                      <span className="text-[11px] text-stone-500">
                        {label} <span className="text-[9px] text-stone-300">{hint}</span>
                      </span>
                      <span className="text-[11px] font-semibold text-stone-700">{val}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-stone-400" style={{ width: `${val}%` }} />
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex-1 overflow-y-auto px-5 pb-5">
        {selectedStop && transferRoutes.length > 0 ? (
          <div className="space-y-2">
            {[route, ...transferRoutes].map((r) => {
              const isExpanded = expandedRoutes.has(r.id);
              const rStops = r.stops;
              const rTransferNames = new Set(
                rStops
                  .filter((s) => allRoutes.some((ar) => ar.id !== r.id && ar.stops.some((os) => os.name === s.name)))
                  .map((s) => s.name),
              );
              return (
                <div key={r.id} className="overflow-hidden rounded-xl border border-stone-100">
                  <button
                    onClick={() => toggleRouteSection(r.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-stone-50 transition-colors"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: r.color, color: r.textColor }}
                    >
                      {r.shortName}
                    </span>
                    <span className="flex-1 truncate text-left text-xs font-medium text-stone-700">{r.name}</span>
                    <span className="text-[10px] text-stone-400">{rStops.length}</span>
                    <svg
                      viewBox="0 0 12 12"
                      className={`h-3 w-3 shrink-0 text-stone-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    >
                      <path d="M2 4l4 4 4-4"/>
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-2 pt-0">
                      <ol className="relative border-l-2" style={{ borderColor: r.color + "44" }}>
                        {rStops.map((stop, i) => (
                          <li key={`${i}-${stop.name}`} className="group mb-0 flex items-center justify-between">
                            <div className="flex items-center min-w-0">
                              <span
                                className="absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2 bg-white"
                                style={{ borderColor: i === 0 || i === rStops.length - 1 ? r.color : r.color + "88" }}
                              />
                              <span className={`py-1.5 pl-4 text-sm ${stop.name === selectedStop ? "font-bold text-stone-900" : "text-stone-700"}`}>
                                {stop.name}
                              </span>
                              {rTransferNames.has(stop.name) && (
                                <span className="ml-1.5 shrink-0 rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-400">
                                  Transfer
                                </span>
                              )}
                            </div>
                            {r.id === route.id && isCustomLine && (
                              <button
                                onClick={() => onDeleteStop(stop.name)}
                                className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 text-stone-300 hover:bg-red-50 hover:text-red-400 transition-all"
                                title="Remove station"
                              >
                                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                  <path d="M1 1l10 10M11 1L1 11"/>
                                </svg>
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold text-stone-500">Stops ({allStops.length})</p>
            <ol className="relative border-l-2" style={{ borderColor: route.color + "44" }}>
              {allStops.map((stop, i) => {
                const isTransfer = transferStopNames.has(stop.name);
                return (
                  <li key={`${i}-${stop.name}`} className="group mb-0 flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <span
                        className="absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2 bg-white"
                        style={{ borderColor: i === 0 || i === allStops.length - 1 ? route.color : route.color + "88" }}
                      />
                      <span className={`py-1.5 pl-4 text-sm ${stop.name === selectedStop ? "font-bold text-stone-900" : "text-stone-700"}`}>
                        {stop.name}
                      </span>
                      {isTransfer && (
                        <span className="ml-1.5 shrink-0 rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-400">
                          Transfer
                        </span>
                      )}
                    </div>
                    {isCustomLine && (
                      <button
                        onClick={() => onDeleteStop(stop.name)}
                        className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 text-stone-300 hover:bg-red-50 hover:text-red-400 transition-all"
                        title="Remove station"
                      >
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M1 1l10 10M11 1L1 11"/>
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
