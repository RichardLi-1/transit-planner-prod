"use client";

import { useState } from "react";

type Version = {
  version: string;
  date: string;
  headline: string;
  subline: string;
  entries: { section: string; items: string[] }[];
};

const VERSIONS: Version[] = [
  {
    version: "v0.6",
    date: "05/05/2026",
    headline: "Council debate. Simulation rework.",
    subline: "LangGraph. Dynamic time.",
    entries: [
      {
        section: "AI Council",
        items: [
          "LangGraph-based council option — debate runs as a structured state graph for cleaner turn sequencing",
          "Cycle through past council outputs without re-running a debate",
          "Council panel open/close and generation state now reflected correctly in the UI",
          "Simulation data injected into council context — agents reason about ridership and travel time scores",
        ],
      },
      {
        section: "Simulation",
        items: [
          "Simulation variables panel — configure peak hour multiplier, base ridership, and capacity per vehicle type",
          "Equity score accessibility: simulation now surfaces transit equity metrics alongside ridership",
          "Dynamic time window — drag the time slider to any hour; simulation updates live without replaying from zero",
        ],
      },
      {
        section: "Preview builds",
        items: [
          "\"Preview\" badge shown automatically on test. and beta. hostnames to distinguish staging from production",
        ],
      },
    ],
  },
  {
    version: "v0.5",
    date: "04/03/2026",
    headline: "Transit deserts. Custom overlays.",
    subline: "Better vehicle info.",
    entries: [
      {
        section: "Transit desert finder",
        items: [
          "New map layer: Transit Deserts — red heat shows high-population areas with poor transit access",
          "Composite access score per population cell: combines frequency, mode weight, connectivity, and walking distance",
          "Subway and LRT weighted higher than buses — reflects reliability and capacity differences",
          "Drawing a new route updates the desert map in real time",
        ],
      },
      {
        section: "Custom overlay",
        items: [
          "Import KML, KMZ, or SHP files as a temporary comparison overlay",
          "Overlay renders in orange on top of the map for visual comparison",
          "Toggle via Map Layers → Custom overlay… in Settings",
        ],
      },
      {
        section: "Live vehicles",
        items: [
          "Vehicle popup now shows full route name (looked up from GTFS routes)",
          "Compass heading derived from bearing (e.g. Northbound, Southwest)",
          "Trip ID shown in popup (last 2 segments for readability)",
        ],
      },
      {
        section: "Mobile",
        items: [
          "Mobile layout: bottom tab bar replaces the desktop sidebar on small screens",
          "Bottom sheets for Lines, Tools, and Settings — map stays visible above",
          "Draw mode strip above the tab bar for adding and editing stops on mobile",
          "Desktop panels and toolbar hidden on mobile to avoid overlap",
        ],
      },
      {
        section: "Bug fixes",
        items: [
          "Fixed feedback modal layout",
          "Removed auth button from production UI",
        ],
      },
    ],
  },
  {
    version: "v0.4",
    date: "03/27/2026",
    headline: "Sharing. Tools panel.",
    subline: "More bug fixes.",
    entries: [
      {
        section: "Sharing & export",
        items: [
          "Copy shareable link — encodes full route state and viewport into a URL",
          "PNG and PDF exports now include a title, date, and route legend overlay",
          "Schematic SVG export — dark TTC-style line diagram with stop labels",
        ],
      },
      {
        section: "Tools panel",
        items: [
          "Simulation: routes dim on the map when running, with a clock overlay showing the active hour",
          "Travel Time: walking, cycling, and driving isochrone modes",
          "Travel Time: click the eyedropper to pick an origin directly on the map",
          "Land acquisition: buses and streetcars excluded from route selector",
          "Route score accessible from the right-side route panel",
          "Population density button shows a loading spinner while fetching",
        ],
      },
      {
        section: "Live vehicles",
        items: [
          "TTC real-time vehicle positions shown on map — toggle via Tools panel",
          "Positions update every 15 seconds from TTC GTFS-RT feed",
        ],
      },
      {
        section: "Bug fixes",
        items: [
          "Fixed new stops not connecting on lines with pre-defined shapes (Line 1, Line 2)",
          "Fixed measure tool intercepting map clicks after the Tools panel is closed",
          "Fixed dark mode not defaulting to system preference on first load",
          "Fixed map PNG export producing a blank image",
        ],
      },
    ],
  },
  {
    version: "v0.3",
    date: "03/27/2026",
    headline: "Settings. Dark mode.",
    subline: "Lots of bug fixes.",
    entries: [
      {
        section: "Settings",
        items: [
          "New settings menu — real gear icon, inline with import/export",
          "Account / auth shown in settings: sign in or avatar + sign out",
          "Map layer toggles moved into settings (coverage zones, heatmap, catchment, disruption, measure)",
          "Give Feedback → GitHub Discussions, Report a Bug → GitHub Issues",
          "Advanced mode toggle hides Game Mode until enabled",
        ],
      },
      {
        section: "Dark mode",
        items: [
          "App-wide dark mode defaults to system preference",
          "Map switches between light-v11 and dark-v11 Mapbox styles",
          "Preference saved to localStorage",
        ],
      },
      {
        section: "Experimental panel",
        items: [
          "Simulation: added play/pause to auto-advance through 24 hrs",
          "Renamed \"Time Simulation\" → \"Simulation\"",
          "Catchment radius: added slider (100–3000 m) and number input alongside preset cards",
        ],
      },
      {
        section: "Routing",
        items: [
          "Streetcar routes now road-snap like buses",
          "Snapped shape is preserved during edits instead of being cleared",
          "Underground tunnel overlay added using portal markers",
        ],
      },
      {
        section: "New line modal",
        items: [
          "Short name field with live badge preview",
          "Short name auto-derived from line name (e.g. \"Sheppard East\" → SE)",
        ],
      },
      {
        section: "GO Transit data",
        items: [
          "GTFS shapes loaded at runtime from go-rail-shapes.geojson",
          "Station stops from GTFS variant_stops.json",
          "Buses can be placed and road-snapped",
          "GO Transit is now a toggleable experimental feature — enable via Settings → Tools panel → GO Transit",
        ],
      },
      {
        section: "Bug fixes",
        items: [
          "Fixed Catmull-Rom curve smoothing skipping on routes with > 20 stops — affected Line 1 (38 stops), Line 2 (31 stops), Eglinton LRT (25 stops)",
        ],
      },
    ],
  },
];

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const [selectedVersion, setSelectedVersion] = useState(VERSIONS[0]!.version);
  const v = VERSIONS.find((v) => v.version === selectedVersion) ?? VERSIONS[0]!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[#D7D7D7] bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3.5 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-500">{v.date}</span>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="text-sm font-medium text-stone-500 bg-transparent border-none outline-none cursor-pointer hover:text-stone-700 transition-colors"
            >
              {VERSIONS.map((ver) => (
                <option key={ver.version} value={ver.version}>{ver.version}</option>
              ))}
            </select>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
          >
            <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Hero */}
        <div className="shrink-0 bg-stone-900 px-8 py-10 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-white/60 uppercase">Transit Planner</span>
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">{v.version}</span>
          </div>
          <div className="space-y-0.5">
            <p className="text-2xl font-bold text-white leading-tight">{v.headline}</p>
            <p className="text-2xl font-bold text-white/40 leading-tight">{v.subline}</p>
          </div>
          <div className="mt-2 flex gap-1.5">
            {["#FFCD00","#00A650","#B100CD","#0099D8","#E3000F","#6366f1"].map((c) => (
              <div key={c} className="h-1.5 w-6 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* Changelog list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {v.entries.map(({ section, items }) => (
            <div key={section}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{section}</p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-stone-100 px-5 py-4">
          <p className="text-sm text-stone-500">
            Thanks for trying this out,{" "}<br />
            <span className="font-semibold text-stone-800">Richard, Fiona, Evan, and Chris</span>
          </p>
        </div>

      </div>
    </div>
  );
}
