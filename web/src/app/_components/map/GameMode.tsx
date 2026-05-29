"use client";

// ── Transit City Builder — Game Mode ─────────────────────────────────────────
// Self-contained overlay. TransitMap only needs to render <GameMode onClose={...} />
// and add a showGameMode toggle. No existing features are modified.

import { useState, useEffect, useCallback } from "react";
import type { Route } from "~/app/map/transit-data";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameEvent {
  id: string;
  type: "nimby" | "political" | "bonus";
  title: string;
  body: string;
  choices: { label: string; budgetDelta: number; approvalDelta: number }[];
}

interface BuildProject {
  routeId: string;
  name: string;
  cost: number;
  yearsToComplete: number;
  yearStarted: number;
  complete: boolean;
}

interface GameState {
  year: number;
  budget: number;          // billions
  approval: number;        // 0–100 %
  coverage: number;        // 0–100 %
  projects: BuildProject[];
  events: GameEvent[];
  activeEvent: GameEvent | null;
  log: string[];
  phase: "playing" | "won" | "lost";
}

// ── Event pool ────────────────────────────────────────────────────────────────

const EVENT_POOL: Omit<GameEvent, "id">[] = [
  {
    type: "nimby",
    title: "Local Opposition",
    body: "Residents near the proposed corridor have launched a petition against construction noise.",
    choices: [
      { label: "Hold public consultations (+approval, -0.2B)", budgetDelta: -0.2, approvalDelta: 8 },
      { label: "Push through construction (-approval)", budgetDelta: 0, approvalDelta: -12 },
      { label: "Reroute around neighbourhood (-0.5B)", budgetDelta: -0.5, approvalDelta: 4 },
    ],
  },
  {
    type: "political",
    title: "Budget Freeze",
    body: "The provincial government has announced a 10% capital spending freeze.",
    choices: [
      { label: "Accept the cut (-0.8B)", budgetDelta: -0.8, approvalDelta: -5 },
      { label: "Lobby for exemption (-0.1B lobbying)", budgetDelta: -0.1, approvalDelta: 2 },
    ],
  },
  {
    type: "political",
    title: "Election Year",
    body: "An election is coming. Transit investment could be a winning issue.",
    choices: [
      { label: "Campaign on transit (+1B if won, 60% chance)", budgetDelta: 0.6, approvalDelta: 10 },
      { label: "Stay quiet, focus on delivery", budgetDelta: 0, approvalDelta: 3 },
    ],
  },
  {
    type: "nimby",
    title: "Heritage Station Conflict",
    body: "A proposed station sits on a heritage site. Archaeologists request a delay.",
    choices: [
      { label: "Fund archaeological study (-0.3B, +approval)", budgetDelta: -0.3, approvalDelta: 6 },
      { label: "Redesign station location (-0.6B)", budgetDelta: -0.6, approvalDelta: 2 },
      { label: "Proceed under protest (-approval)", budgetDelta: 0, approvalDelta: -15 },
    ],
  },
  {
    type: "bonus",
    title: "Federal Infrastructure Grant",
    body: "Ottawa has approved a 40% co-funding contribution for transit projects.",
    choices: [
      { label: "Accept the grant (+1.5B)", budgetDelta: 1.5, approvalDelta: 5 },
    ],
  },
  {
    type: "bonus",
    title: "Ridership Exceeds Projections",
    body: "Farebox revenue is 20% above forecast. The surplus goes back to capital.",
    choices: [
      { label: "Reinvest in network (+0.6B)", budgetDelta: 0.6, approvalDelta: 8 },
    ],
  },
  {
    type: "nimby",
    title: "Bus Terminal Backlash",
    body: "A neighbourhood doesn't want a bus terminal. Counter-proposals are circulating.",
    choices: [
      { label: "Relocate terminal (-0.4B)", budgetDelta: -0.4, approvalDelta: 5 },
      { label: "Community benefit fund (-0.2B)", budgetDelta: -0.2, approvalDelta: 3 },
      { label: "Stand firm (-approval)", budgetDelta: 0, approvalDelta: -8 },
    ],
  },
];

// ── Project catalogue ─────────────────────────────────────────────────────────

interface ProjectTemplate {
  id: string;
  name: string;
  cost: number;
  years: number;
  coverageGain: number;
  desc: string;
}

const PROJECTS: ProjectTemplate[] = [
  { id: "dl",  name: "Downtown Relief Line",  cost: 8.5, years: 6, coverageGain: 12, desc: "Subway, 12 stations" },
  { id: "eg",  name: "Eglinton Extension",    cost: 4.2, years: 4, coverageGain: 9,  desc: "LRT, 9 new stops" },
  { id: "fw",  name: "Finch West Extension",  cost: 2.8, years: 3, coverageGain: 7,  desc: "LRT, 7 stations" },
  { id: "ss",  name: "Scarborough Subway",    cost: 5.5, years: 5, coverageGain: 8,  desc: "Subway, 6 stations" },
  { id: "ha",  name: "Hamilton LRT",          cost: 1.4, years: 2, coverageGain: 5,  desc: "LRT, 14 stops" },
  { id: "brt", name: "Brampton BRT Network",  cost: 0.9, years: 2, coverageGain: 4,  desc: "BRT, 20 stops" },
  { id: "go",  name: "GO Rail Electrification",cost: 6.0,years: 5, coverageGain: 10, desc: "All GO corridors" },
  { id: "ms",  name: "Mississauga Busway",    cost: 0.7, years: 1, coverageGain: 3,  desc: "BRT, 12 stops" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomEvent(): GameEvent {
  const tmpl = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)]!;
  return { ...tmpl, id: `evt-${Date.now()}` };
}

function initState(): GameState {
  return {
    year: 2025,
    budget: 5,
    approval: 60,
    coverage: 35,
    projects: [],
    events: [],
    activeEvent: null,
    log: ["🎮 Welcome to Transit City Builder! You have $5B and 10 years to build a world-class transit network."],
    phase: "playing",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-white/70 mb-0.5">
        <span>{label}</span><span className="font-bold text-white">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  routes: Route[];
  onClose: () => void;
}

export function GameMode({ routes: _routes, onClose }: Props) {
  const [gs, setGs] = useState<GameState>(initState);
  const [view, setView] = useState<"hud" | "build" | "log">("hud");

  // Compute coverage from active projects
  const effectiveCoverage = Math.min(100, gs.coverage + gs.projects.filter((p) => p.complete).reduce((s, p) => {
    const tmpl = PROJECTS.find((t) => t.id === p.routeId);
    return s + (tmpl?.coverageGain ?? 0);
  }, 0));

  // Win/lose check
  useEffect(() => {
    if (gs.phase !== "playing") return;
    if (effectiveCoverage >= 80 && gs.budget >= 0) {
      setGs((g) => ({ ...g, phase: "won" }));
    } else if (gs.budget < 0 || gs.approval < 10) {
      setGs((g) => ({ ...g, phase: "lost" }));
    } else if (gs.year >= 2035 && effectiveCoverage < 80) {
      setGs((g) => ({ ...g, phase: "lost" }));
    }
  }, [gs.budget, gs.approval, gs.year, gs.phase, effectiveCoverage]);

  const advanceYear = useCallback(() => {
    setGs((g) => {
      if (g.phase !== "playing") return g;
      const newYear = g.year + 1;
      const completed: string[] = [];
      const updatedProjects = g.projects.map((p) => {
        if (p.complete) return p;
        if (newYear - p.yearStarted >= p.yearsToComplete) {
          const tmpl = PROJECTS.find((t) => t.id === p.routeId);
          completed.push(`✅ ${p.name} opened!`);
          return { ...p, complete: true };
        }
        return p;
      });
      const newLog = [...completed];
      // Random event every 1–2 years
      const triggerEvent = Math.random() < 0.6;
      const newEvent = triggerEvent && !g.activeEvent ? randomEvent() : null;
      if (newEvent) newLog.push(`⚡ Event: ${newEvent.title}`);
      return {
        ...g,
        year: newYear,
        projects: updatedProjects,
        activeEvent: newEvent ?? g.activeEvent,
        log: [...g.log, `📅 Year ${newYear}`, ...newLog],
      };
    });
  }, []);

  const buildProject = useCallback((tmpl: ProjectTemplate) => {
    setGs((g) => {
      if (g.budget < tmpl.cost) return g;
      const alreadyBuilt = g.projects.some((p) => p.routeId === tmpl.id);
      if (alreadyBuilt) return g;
      return {
        ...g,
        budget: Math.round((g.budget - tmpl.cost) * 10) / 10,
        projects: [...g.projects, { routeId: tmpl.id, name: tmpl.name, cost: tmpl.cost, yearsToComplete: tmpl.years, yearStarted: g.year, complete: false }],
        log: [...g.log, `🚧 Broke ground on ${tmpl.name} ($${tmpl.cost}B)`],
      };
    });
    setView("hud");
  }, []);

  const resolveEvent = useCallback((choice: GameEvent["choices"][number]) => {
    setGs((g) => ({
      ...g,
      budget: Math.round((g.budget + choice.budgetDelta) * 10) / 10,
      approval: Math.max(0, Math.min(100, g.approval + choice.approvalDelta)),
      activeEvent: null,
      log: [...g.log, `💬 Chose: "${choice.label}"`],
    }));
  }, []);

  // ── End screens ──
  if (gs.phase === "won") return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <p className="text-4xl mb-3">🏆</p>
        <h2 className="text-xl font-black text-stone-900 mb-1">Network Complete!</h2>
        <p className="text-sm text-stone-500 mb-4">You reached {Math.round(effectiveCoverage)}% coverage by {gs.year} with ${gs.budget.toFixed(1)}B remaining.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => setGs(initState)} className="rounded-xl bg-stone-900 text-white px-4 py-2 text-sm font-semibold">Play Again</button>
          <button onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold">Exit</button>
        </div>
      </div>
    </div>
  );

  if (gs.phase === "lost") return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <p className="text-4xl mb-3">📉</p>
        <h2 className="text-xl font-black text-stone-900 mb-1">Network Derailed</h2>
        <p className="text-sm text-stone-500 mb-1">{gs.budget < 0 ? "You ran out of budget." : gs.approval < 10 ? "Public approval collapsed." : "Time ran out with insufficient coverage."}</p>
        <p className="text-sm text-stone-400 mb-4">{Math.round(effectiveCoverage)}% coverage reached by {gs.year}.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => setGs(initState)} className="rounded-xl bg-stone-900 text-white px-4 py-2 text-sm font-semibold">Try Again</button>
          <button onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold">Exit</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* HUD — top bar */}
      <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 w-[520px] max-w-[calc(100vw-32px)]">
        <div className="rounded-2xl bg-stone-900/95 backdrop-blur-sm border border-white/10 shadow-2xl px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-white font-black text-sm">Transit City Builder</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">YEAR {gs.year}</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">${gs.budget.toFixed(1)}B</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setView(view === "build" ? "hud" : "build")} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors">
                {view === "build" ? "← Back" : "🚧 Build"}
              </button>
              <button onClick={() => setView(view === "log" ? "hud" : "log")} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors">📋</button>
              <button onClick={onClose} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/60 transition-colors">✕</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Meter label="Coverage" value={effectiveCoverage} color="bg-emerald-400" />
            <Meter label="Approval" value={gs.approval} color="bg-sky-400" />
            <Meter label="Timeline" value={((gs.year - 2025) / 10) * 100} color="bg-amber-400" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-white/40">Goal: 80% coverage by 2035</p>
            <button
              onClick={advanceYear}
              disabled={!!gs.activeEvent}
              className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 px-3 py-1 text-[11px] font-bold text-white transition-colors"
            >
              Advance Year →
            </button>
          </div>
        </div>

        {/* Build panel */}
        {view === "build" && (
          <div className="mt-2 rounded-2xl bg-stone-900/95 backdrop-blur-sm border border-white/10 shadow-2xl px-4 py-3">
            <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide mb-2">Available Projects</p>
            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
              {PROJECTS.map((tmpl) => {
                const built = gs.projects.some((p) => p.routeId === tmpl.id);
                const canAfford = gs.budget >= tmpl.cost;
                return (
                  <button
                    key={tmpl.id}
                    disabled={built || !canAfford}
                    onClick={() => buildProject(tmpl)}
                    className={`text-left rounded-xl border px-2.5 py-2 transition-colors ${built ? "border-emerald-500/30 bg-emerald-500/10" : canAfford ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-white/5 bg-white/[0.02] opacity-50"}`}
                  >
                    <p className="text-[11px] font-semibold text-white leading-tight">{tmpl.name}</p>
                    <p className="text-[9px] text-white/40 mt-0.5">{tmpl.desc}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] font-bold text-emerald-400">${tmpl.cost}B</span>
                      <span className="text-[9px] text-white/40">{tmpl.years}yr</span>
                      <span className="text-[9px] text-sky-400">+{tmpl.coverageGain}% cov</span>
                    </div>
                    {built && <span className="text-[9px] text-emerald-400 font-semibold">✓ Built</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Log panel */}
        {view === "log" && (
          <div className="mt-2 rounded-2xl bg-stone-900/95 backdrop-blur-sm border border-white/10 shadow-2xl px-4 py-3">
            <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide mb-2">Event Log</p>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {[...gs.log].reverse().map((entry, i) => (
                <p key={i} className="text-[11px] text-white/60">{entry}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active event modal */}
      {gs.activeEvent && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4">
            <div className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide mb-3 ${gs.activeEvent.type === "nimby" ? "bg-amber-100 text-amber-700" : gs.activeEvent.type === "bonus" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
              {gs.activeEvent.type}
            </div>
            <h3 className="text-sm font-black text-stone-900 mb-1">{gs.activeEvent.title}</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">{gs.activeEvent.body}</p>
            <div className="space-y-1.5">
              {gs.activeEvent.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => resolveEvent(c)}
                  className="w-full text-left rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 hover:bg-white hover:border-stone-300 transition-colors"
                >
                  <p className="text-xs font-semibold text-stone-700">{c.label}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {c.budgetDelta !== 0 && <span className={c.budgetDelta > 0 ? "text-emerald-600" : "text-rose-600"}>{c.budgetDelta > 0 ? `+$${c.budgetDelta}B ` : `$${c.budgetDelta}B `}</span>}
                    {c.approvalDelta !== 0 && <span className={c.approvalDelta > 0 ? "text-sky-600" : "text-rose-600"}>{c.approvalDelta > 0 ? `+${c.approvalDelta}% approval` : `${c.approvalDelta}% approval`}</span>}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
