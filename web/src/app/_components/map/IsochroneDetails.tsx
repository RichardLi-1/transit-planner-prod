"use client";

import { useEffect, useState } from "react";
import type { Route } from "~/app/map/transit-data";

// 📖 Learn: this is the "details" panel that LayersDropdown renders inline
// under the Isochrone toggle when it's on. It's a compact version of what
// used to live in ExperimentalPanel's Isochrone tab. The parent (TransitMap)
// passes in the state setters from the `useIsochrone` hook so the actual
// state still lives there — this is a pure view component.

interface Props {
  routes: Route[];
  isochroneOrigin: [number, number] | null;
  onSetIsochroneOrigin: (coords: [number, number] | null) => void;
  isochroneMinutes: number;
  onSetIsochroneMinutes: (m: number) => void;
  isoMode: "walking" | "cycling" | "driving";
  onSetIsoMode: (m: "walking" | "cycling" | "driving") => void;
  pickingIsochroneOrigin: boolean;
  onStartPickIsochroneOrigin: () => void;
}

export function IsochroneDetails({
  routes,
  isochroneOrigin,
  onSetIsochroneOrigin,
  isochroneMinutes,
  onSetIsochroneMinutes,
  isoMode,
  onSetIsoMode,
  pickingIsochroneOrigin,
  onStartPickIsochroneOrigin,
}: Props) {
  // Local state for the origin select — purely UI bookkeeping so the <select>
  // knows which option is currently chosen. Resets if the parent clears the
  // origin (e.g. user clicked "Clear").
  const [isoOriginId, setIsoOriginId] = useState("");
  useEffect(() => {
    if (!isochroneOrigin) setIsoOriginId("");
  }, [isochroneOrigin]);

  const TIME_COLORS: Record<number, string> = { 15: "#10b981", 30: "#f59e0b", 45: "#ef4444", 60: "#7c3aed" };

  return (
    <div className="space-y-2">
      {/* Pick origin on map */}
      <button
        onClick={onStartPickIsochroneOrigin}
        className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
          pickingIsochroneOrigin
            ? "border-teal-400 bg-teal-50 text-teal-700"
            : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
        </svg>
        {pickingIsochroneOrigin ? "Click a point on the map…" : "Pick point on map"}
      </button>

      {/* Or select an existing stop */}
      <select
        value={isoOriginId}
        onChange={(e) => {
          const id = e.target.value;
          setIsoOriginId(id);
          if (!id) { onSetIsochroneOrigin(null); return; }
          // ID format: "<routeId>::<stopName>" (route names can repeat across lines)
          const [routeId, ...rest] = id.split("::");
          const stopName = rest.join("::");
          const stop = routes.find((r) => r.id === routeId)?.stops.find((s) => s.name === stopName);
          onSetIsochroneOrigin(stop ? stop.coords : null);
        }}
        className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-700 outline-none focus:border-stone-400"
      >
        <option value="">— or pick from stop list —</option>
        {routes
          .flatMap((r) => r.stops.map((s) => ({ id: `${r.id}::${s.name}`, label: `${s.name} (${r.shortName})` })))
          .slice(0, 80)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>

      {/* Travel mode pills */}
      <div className="flex gap-1">
        {(["walking", "cycling", "driving"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onSetIsoMode(m)}
            className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium capitalize transition-colors ${
              isoMode === m
                ? "border-teal-400 bg-teal-50 text-teal-700"
                : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Minutes slider */}
      <div>
        <div className="flex justify-between text-[10px]">
          <span className="text-stone-500">Max travel time</span>
          <span className="font-semibold text-stone-700">{isochroneMinutes} min</span>
        </div>
        <input
          type="range"
          min={10}
          max={60}
          step={5}
          value={isochroneMinutes}
          onChange={(e) => onSetIsochroneMinutes(Number(e.target.value))}
          className="mt-0.5 w-full accent-teal-500"
        />
      </div>

      {/* Status row + clear */}
      {isochroneOrigin ? (
        <div className="flex items-center justify-between rounded-md bg-teal-50 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-teal-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: TIME_COLORS[Math.min(60, isochroneMinutes) as 15 | 30 | 45 | 60] ?? "#7c3aed" }} />
            <span className="ml-1.5">Showing {isochroneMinutes} min {isoMode}</span>
          </span>
          <button
            onClick={() => { setIsoOriginId(""); onSetIsochroneOrigin(null); }}
            className="text-[10px] text-teal-500 hover:text-teal-700"
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="text-[10px] italic text-stone-400">Pick an origin to show travel time</p>
      )}
    </div>
  );
}
