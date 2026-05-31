"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Route } from "~/app/map/transit-data";
import { useStationSummary } from "../useStationSummary";

export function StationPopup({
  popup,
  allRoutes,
  stationPopulations,
  isDeletable,
  connectedRoutes,
  pedestrianConnections = [],
  onClose,
  onDelete,
  onDeleteFromAll,
  onAddTransfer,
  onRemoveTransfer,
  onRename,
}: {
  popup: { name: string; routeId: string; x: number; y: number; coords?: [number, number] };
  allRoutes: Route[];
  stationPopulations: Map<string, number>;
  isDeletable: boolean;
  connectedRoutes: Route[];
  pedestrianConnections?: { route: Route; stopName: string }[];
  onClose: () => void;
  onDelete: () => void;
  onDeleteFromAll: () => void;
  onAddTransfer?: (targetRouteId: string) => void;
  onRemoveTransfer: (targetRouteId: string) => void;
  onRename?: (newName: string) => void;
}) {
  const currentRoute = allRoutes.find((r) => r.id === popup.routeId);
  const connectedIds = new Set(connectedRoutes.map((r) => r.id));
  const transferableRoutes = allRoutes.filter((r) => r.id !== popup.routeId && !connectedIds.has(r.id));
  
  // Get population served from the pre-computed stationPopulations (Voronoi method, 1km cutoff for streetcar/bus, 5km for subway/LRT)
  const rawPopulationServed = stationPopulations.get(popup.name);
  const populationServed = rawPopulationServed !== undefined ? Math.max(2314, rawPopulationServed) : undefined;
  
  // Estimate ridership as ~15% of population served
  const ridership = populationServed !== undefined ? Math.round(populationServed * 0.15) : undefined;
  
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setRenameValue(popup.name);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== popup.name) onRename?.(trimmed);
    setIsRenaming(false);
  }

  function cancelRename() {
    setIsRenaming(false);
  }

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  // AI Summary hook
  const { getSummary, isLoading: isSummaryLoading, getCachedSummary } = useStationSummary();
  const [summary, setSummary] = useState<string>("");
  const [showSummary, setShowSummary] = useState(false);

  // Flip popup below the point if it would be cropped at the top
  const popupRef = useRef<HTMLDivElement>(null);
  const [flipDown, setFlipDown] = useState(false);

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFlipDown(rect.top < 8);
  }, [popup.x, popup.y, showSummary]);

  // Collect all stations for comparison
  const allStations = allRoutes.flatMap(route => 
    route.stops.map(stop => {
      const pop = stationPopulations.get(stop.name);
      return {
        name: stop.name,
        ridership: pop !== undefined ? Math.round(Math.max(2314, pop) * 0.15) : undefined
      };
    })
  );

  useEffect(() => {
    if (showSummary && !summary && !isSummaryLoading(popup.name, currentRoute?.name ?? "")) {
      const cached = getCachedSummary(popup.name, currentRoute?.name ?? "");
      if (cached) {
        setSummary(cached);
      } else {
        void getSummary({
          stationName: popup.name,
          routeName: currentRoute?.name ?? popup.routeId,
          ridership,
          populationServed,
          connections: connectedRoutes.map(r => r.name),
          allStations,
        }).then(setSummary).catch(console.error);
      }
    }
  }, [showSummary, popup.name, currentRoute, ridership, populationServed, connectedRoutes, allStations, getSummary, getCachedSummary, isSummaryLoading, summary]);

  return (
    <div
      ref={popupRef}
      className="pointer-events-auto absolute z-20 w-56 rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
      style={{ left: popup.x, top: popup.y, transform: flipDown ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))" }}
    >
      {/* Arrow */}
      {flipDown ? (
        <>
          <div className="absolute left-1/2 -top-[6px] -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent" style={{ borderBottomColor: "#e7e5e4" }} />
          <div className="absolute left-1/2 -top-[5px] -translate-x-1/2 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent" style={{ borderBottomColor: "#ffffff" }} />
        </>
      ) : (
        <>
          <div className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent" style={{ borderTopColor: "#e7e5e4" }} />
          <div className="absolute left-1/2 -bottom-[5px] -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent" style={{ borderTopColor: "#ffffff" }} />
        </>
      )}
      {/* Title + action buttons get their own full-width row so the route
          color bar below can never squeeze the station name into wrapping. */}
      <div className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                }}
                className="min-w-0 w-full rounded border border-stone-300 bg-white px-1 py-0 text-sm font-semibold text-stone-800 outline-none focus:border-stone-500"
              />
            ) : onRename ? (
              <button
                onClick={startRename}
                title="Click to rename"
                className="group flex min-w-0 items-center gap-1 truncate text-left"
              >
                <span className="truncate text-sm font-semibold text-stone-800">{popup.name}</span>
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-stone-300 opacity-0 transition-opacity group-hover:opacity-100" fill="currentColor">
                  <path d="M8.5 1.5a1.5 1.5 0 0 1 2.12 2.12L9.5 4.75 7.25 2.5l1.25-1Zm-1.5 1.5L1 9v2h2l6-6.25-1.75-1.75-.25-.25Z"/>
                </svg>
              </button>
            ) : (
              <span className="truncate text-sm font-semibold text-stone-800">{popup.name}</span>
            )}
            {connectedRoutes.length > 0 && (
              <p className="mt-0.5 text-[10px] font-medium text-stone-500">
                Transfer: {[currentRoute, ...connectedRoutes].filter(Boolean).map((r) => `Line ${r!.shortName}`).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isDeletable && (
              <button
                onClick={() => connectedRoutes.length > 0 ? setDeleteConfirm(true) : onDelete()}
                title="Remove station"
                className="rounded p-0.5 text-stone-300 hover:bg-red-50 hover:text-red-400 transition-colors"
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="currentColor">
                  <path fillRule="evenodd" d="M6 1a1.75 1.75 0 0 0-1.736 1.502H2.75a.75.75 0 0 0 0 1.5h.148l.465 6.52A1.75 1.75 0 0 0 5.11 12h3.78a1.75 1.75 0 0 0 1.747-1.478l.465-6.52h.148a.75.75 0 0 0 0-1.5H9.736A1.75 1.75 0 0 0 8 1H6Zm1 1.5a.25.25 0 0 0-.247.215L6.5 2.5h1l-.253-.285A.25.25 0 0 0 7 2.5Zm-1.5 3a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Zm2.5 0a.5.5 0 0 1 1 0l-.2 4a.3.3 0 0 1-.6 0l-.2-4Z" clipRule="evenodd"/>
                </svg>
              </button>
            )}
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
              <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Route color bar on its own row — flex-wrap so many routes wrap
            to a second line instead of growing wider and pushing text. */}
        {connectedRoutes.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
            <span
              className="h-2.5 w-3.5 rounded-l-full"
              style={{ background: currentRoute?.color ?? "#94a3b8" }}
            />
            {connectedRoutes.map((r) => (
              <span
                key={r.id}
                className="h-2.5 w-3.5 last:rounded-r-full"
                style={{ background: r.color }}
              />
            ))}
          </div>
        ) : (
          <span
            className="mt-1.5 inline-block h-2.5 w-5 rounded-full"
            style={{ background: currentRoute?.color ?? "#94a3b8" }}
          />
        )}
      </div>

      {/* AI Summary Section */}
      <div className="mb-2 border-t border-stone-100 pt-2">
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="flex w-full items-center justify-between text-left text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Station Analysis
          </span>
          <svg 
            className={`h-3 w-3 transition-transform ${showSummary ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showSummary && (
          <div className="mt-2 rounded-lg bg-stone-50 p-2.5">
            <div className="mb-1.5 space-y-1 text-[10px] text-stone-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Population Served:</span>
                {populationServed !== undefined ? (
                  <span>{populationServed.toLocaleString()} people (nearest-station, {currentRoute?.type === "streetcar" || currentRoute?.type === "bus" ? "1" : "5"}km cutoff)</span>
                ) : (
                  <span className="text-stone-400">Data unavailable</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Est. Daily Ridership:</span>
                {ridership !== undefined ? (
                  <span>{ridership.toLocaleString()} passengers</span>
                ) : (
                  <span className="text-stone-400">Data unavailable</span>
                )}
              </div>
            </div>
            {isSummaryLoading(popup.name, currentRoute?.name ?? "") ? (
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Analyzing station data...</span>
              </div>
            ) : summary ? (
              <p className="max-h-40 overflow-y-auto text-xs leading-relaxed text-stone-700">{summary}</p>
            ) : (
              <p className="text-xs text-stone-500 italic">Click to generate analysis</p>
            )}
          </div>
        )}
      </div>

      {connectedRoutes.length > 0 && (
        <div className="mb-2">
          <p className="mb-1.5 text-xs font-semibold text-stone-500">
            Connections
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connectedRoutes.map((r) => (
              <button
                key={r.id}
                onClick={() => onRemoveTransfer(r.id)}
                title={`Remove connection to ${r.name}`}
                className="group flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ background: r.color, color: r.textColor }}
              >
                <span>{r.shortName}</span>
                <span className="opacity-60 group-hover:opacity-100">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {pedestrianConnections.length > 0 && (
        <div className="mb-2 rounded-lg border border-stone-200 px-2.5 py-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="2" r="1" fill="currentColor" stroke="none"/>
              <path d="M6 4v3l-1.5 2M6 7l1.5 2M4.5 5.5h3"/>
            </svg>
            Same station
          </p>
          {pedestrianConnections.map(({ route: r, stopName }) => (
            <div key={r.id} className="flex items-center gap-1.5 text-xs text-stone-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span>Line {r.shortName} · {stopName}</span>
              <span className="ml-auto text-[10px] text-stone-400">by foot</span>
            </div>
          ))}
        </div>
      )}
      {onAddTransfer && transferableRoutes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-stone-500 shrink-0">Add transfer to:</span>
          {transferableRoutes.map((r) => (
            <button
              key={r.id}
              onClick={() => onAddTransfer(r.id)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: r.color, color: r.textColor }}
            >
              <span>{r.shortName}</span>
            </button>
          ))}
        </div>
      )}
      {deleteConfirm && (
        <div className="mt-2 border-t border-stone-100 pt-2">
          <p className="mb-1.5 text-xs text-stone-500">Remove from which lines?</p>
          <div className="flex gap-1.5">
            <button
              onClick={onDelete}
              className="flex-1 rounded-lg bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-colors"
            >
              This line
            </button>
            <button
              onClick={onDeleteFromAll}
              className="flex-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              All lines
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
