"use client";

import { useState, useCallback } from "react";
import type { Route } from "~/app/map/transit-data";

// ── Types ─────────────────────────────────────────────────────────────────────

type IncomeBreakdown = Record<string, number>;

interface RunStats {
  pct_accessible: number;
  avg_transit_time_min: number;
  median_transit_time_min: number;
  p90_transit_time_min: number;
  avg_total_time_min: number;
  avg_transfers: number;
  avg_car_time_min: number;
  income_breakdown: IncomeBreakdown;
}

interface DeltaStats {
  time_saved_min: number;
  total_time_saved_min: number;
  accessibility_gain_pct: number;
  transfer_reduction: number;
  equity_improvement: number;
  newly_accessible_agents: number;
}

interface EquityStats {
  baseline_score: number;
  scenario_score: number;
}

export interface StressSegment {
  line_name?: string;
  from_stop: string;
  to_stop: string;
  from_coords: [number, number];
  to_coords: [number, number];
  agent_trips: number;
  stress_pct: number;
  edge_pk?: number;
}

export interface PerAgentResult {
  home_lon: number;
  home_lat: number;
  income: string;
  transit_dep: number;
  baseline_time: number;
  scenario_time: number;
  time_saved_min: number;
  newly_accessible: boolean;
  path_coords: [number, number][];
}

export interface SimulationResult {
  scenario_name: string;
  agent_count: number;
  run_duration_s: number;
  has_proposed_lines: boolean;
  baseline: RunStats;
  scenario: RunStats;
  delta: DeltaStats;
  equity: EquityStats;
  line_stress: StressSegment[];
  baseline_edge_stress: StressSegment[];
  per_agent: PerAgentResult[];
  narrative: string;
  graph_stats: {
    baseline_nodes: number;
    baseline_edges: number;
    scenario_nodes: number;
    scenario_edges: number;
  };
}

export interface SimulationPanelProps {
  customRoutes: Route[];
  onClose: () => void;
  onResults: (result: SimulationResult | null) => void;
  onAnimate: (agents: PerAgentResult[]) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatRow({
  label,
  baseline,
  scenario,
  unit = "",
  better = "lower",
  hideScenario = false,
}: {
  label: string;
  baseline: number | string;
  scenario: number | string;
  unit?: string;
  better?: "lower" | "higher";
  hideScenario?: boolean;
}) {
  const bNum = typeof baseline === "number" ? baseline : parseFloat(baseline as string);
  const sNum = typeof scenario === "number" ? scenario : parseFloat(scenario as string);
  const improved = better === "lower" ? sNum < bNum : sNum > bNum;
  const delta = !hideScenario && typeof bNum === "number" && typeof sNum === "number" ? sNum - bNum : null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0">
      <span className="text-xs text-stone-500 w-36 shrink-0">{label}</span>
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className={`${hideScenario ? "text-stone-700 font-semibold" : "text-stone-400"} w-14 text-right`}>
          {typeof baseline === "number" ? baseline.toFixed(1) : baseline}
          {unit}
        </span>
        {!hideScenario && (
          <>
            <span className="text-stone-300">→</span>
            <span
              className={`w-14 text-right font-semibold ${
                delta !== null && Math.abs(delta) > 0.05
                  ? improved
                    ? "text-emerald-600"
                    : "text-red-500"
                  : "text-stone-600"
              }`}
            >
              {typeof scenario === "number" ? scenario.toFixed(1) : scenario}
              {unit}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-stone-500">{label}</span>
        <span className="font-semibold text-stone-700">{value.toFixed(0)}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StressBar({ segment }: { segment: StressSegment }) {
  const color =
    segment.stress_pct > 75
      ? "#ef4444"
      : segment.stress_pct > 40
      ? "#f59e0b"
      : "#10b981";

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs text-stone-700 font-medium">
          {segment.from_stop} → {segment.to_stop}
        </p>
        <p className="text-[10px] text-stone-400">
          {segment.agent_trips} trips{segment.line_name ? ` · ${segment.line_name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-16 h-1.5 rounded-full bg-stone-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${segment.stress_pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-[10px] font-mono text-stone-500 w-8 text-right">
          {segment.stress_pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function SimulationPanel({ customRoutes, onClose, onResults, onAnimate }: SimulationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [agentCount, setAgentCount] = useState(500);
  const [activeTab, setActiveTab] = useState<"overview" | "equity" | "stress" | "narrative">("overview");

  const hasProposed = customRoutes.length > 0;
  const scenarioName = hasProposed
    ? (customRoutes.length === 1 ? (customRoutes[0]?.name ?? "Proposed Line") : `${customRoutes.length} Custom Lines`)
    : "Baseline Network";

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);

    const proposedLines = customRoutes.map((r) => ({
      name: r.name,
      type: r.type,
      stops: r.stops.map((s) => ({ name: s.name, coords: s.coords })),
    }));

    try {
      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposed_lines: proposedLines,
          agent_count: agentCount,
          scenario_name: scenarioName,
          narrate: hasProposed,  // only narrate when there are proposed lines
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as SimulationResult;
      setResult(data);
      onResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      onResults(null);
    } finally {
      setLoading(false);
    }
  }, [customRoutes, agentCount, scenarioName, hasProposed, onResults]);

  const handleClose = () => {
    onResults(null);
    onClose();
  };

  // Tabs available depend on whether there are proposed lines
  type TabId = "overview" | "equity" | "stress" | "narrative";
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "equity",   label: "Equity" },
    { id: "stress",   label: "Stress" },
    ...(result?.has_proposed_lines ? [{ id: "narrative" as TabId, label: "Analysis" }] : []),
  ];

  return (
    <div className="pointer-events-auto flex flex-col w-[320px] rounded-2xl border border-[#D7D7D7] bg-white shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-stone-800">Agent Simulation</span>
        </div>
        <button
          onClick={handleClose}
          className="text-stone-400 hover:text-stone-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Config row */}
      {!result && (
        <div className="px-4 py-3 border-b border-stone-100 bg-stone-50 space-y-3">
          {/* What will be simulated */}
          <div>
            <p className="text-xs font-medium text-stone-600 mb-1">
              {hasProposed ? "Comparing against proposed lines" : "Simulating existing network"}
            </p>
            {hasProposed ? (
              <ul className="space-y-0.5">
                {customRoutes.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs text-stone-600">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    {r.name} ({r.stops.length} stops)
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-400">
                Shows stress on current TTC network. Draw custom lines to compare scenarios.
              </p>
            )}
          </div>

          {/* Agent count slider */}
          <div>
            <label className="text-xs font-medium text-stone-600">
              Agents: <span className="text-stone-800 font-semibold">{agentCount.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={agentCount}
              onChange={(e) => setAgentCount(Number(e.target.value))}
              className="mt-1 w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-stone-400">
              <span>100 (fast)</span>
              <span>2000 (thorough)</span>
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className={`w-full rounded-xl py-2 text-sm font-medium transition-all ${
              loading
                ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                : "bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98]"
            }`}
          >
            {loading
              ? "Running simulation…"
              : hasProposed
              ? "Run Scenario Comparison"
              : "Run Baseline Simulation"}
          </button>

          {loading && (
            <div className="space-y-1">
              <p className="text-xs text-stone-500">
                Building transit graph + routing {agentCount.toLocaleString()} agents…
              </p>
              <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-stone-100 bg-stone-50 text-xs font-medium">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-violet-600 text-violet-700 bg-white"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[calc(100vh-260px)]">

            {/* ── Overview tab ── */}
            {activeTab === "overview" && (
              <div className="space-y-3">
                {/* Delta hero — only shown when there are proposed lines */}
                {result.has_proposed_lines && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                      <p className="text-[10px] text-emerald-600 uppercase tracking-wide mb-0.5">Time saved</p>
                      <p className="text-2xl font-bold text-emerald-700">
                        {result.delta.total_time_saved_min > 0
                          ? result.delta.total_time_saved_min.toFixed(1)
                          : "–"}
                      </p>
                      <p className="text-[10px] text-emerald-500">min avg</p>
                    </div>
                    <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                      <p className="text-[10px] text-violet-600 uppercase tracking-wide mb-0.5">Newly reached</p>
                      <p className="text-2xl font-bold text-violet-700">
                        {result.delta.newly_accessible_agents}
                      </p>
                      <p className="text-[10px] text-violet-500">agents</p>
                    </div>
                  </div>
                )}

                {/* Stat table */}
                <div className="rounded-xl border border-stone-100 px-3 py-2">
                  <StatRow
                    label="Transit accessible"
                    baseline={result.baseline.pct_accessible}
                    scenario={result.scenario.pct_accessible}
                    unit="%"
                    better="higher"
                    hideScenario={!result.has_proposed_lines}
                  />
                  <StatRow
                    label="Avg transit time"
                    baseline={result.baseline.avg_transit_time_min}
                    scenario={result.scenario.avg_transit_time_min}
                    unit=" min"
                    better="lower"
                    hideScenario={!result.has_proposed_lines}
                  />
                  <StatRow
                    label="Avg door-to-door"
                    baseline={result.baseline.avg_total_time_min}
                    scenario={result.scenario.avg_total_time_min}
                    unit=" min"
                    better="lower"
                    hideScenario={!result.has_proposed_lines}
                  />
                  <StatRow
                    label="P90 transit time"
                    baseline={result.baseline.p90_transit_time_min}
                    scenario={result.scenario.p90_transit_time_min}
                    unit=" min"
                    better="lower"
                    hideScenario={!result.has_proposed_lines}
                  />
                  <StatRow
                    label="Avg transfers"
                    baseline={result.baseline.avg_transfers}
                    scenario={result.scenario.avg_transfers}
                    better="lower"
                    hideScenario={!result.has_proposed_lines}
                  />
                </div>

                <p className="text-[10px] text-stone-400 text-center">
                  {result.agent_count.toLocaleString()} agents · {result.run_duration_s}s ·{" "}
                  {result.graph_stats.baseline_nodes.toLocaleString()} stops in graph
                </p>

                <button
                  onClick={() => onAnimate(result.per_agent.filter((p) => p.path_coords.length > 0))}
                  className="w-full rounded-xl py-2 text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] transition-all"
                >
                  Animate agents on map
                </button>

                <button
                  onClick={() => { setResult(null); onResults(null); }}
                  className="w-full text-xs text-stone-400 hover:text-stone-600 underline"
                >
                  Change settings and re-run
                </button>
              </div>
            )}

            {/* ── Equity tab ── */}
            {activeTab === "equity" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <ScoreBadge
                    label={result.has_proposed_lines ? "Baseline equity score" : "Equity score"}
                    value={result.equity.baseline_score}
                    color={result.has_proposed_lines ? "#94a3b8" : "#7c3aed"}
                  />
                  {result.has_proposed_lines && (
                    <ScoreBadge
                      label="Scenario equity score"
                      value={result.equity.scenario_score}
                      color="#7c3aed"
                    />
                  )}
                </div>

                <div className="rounded-xl border border-stone-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-2">
                    Avg door-to-door by income
                  </p>
                  {(["low", "mid", "high"] as const).map((inc) => {
                    const b = result.baseline.income_breakdown[inc];
                    const s = result.scenario.income_breakdown[inc];
                    if (!b) return null;
                    return (
                      <StatRow
                        key={inc}
                        label={`${inc.charAt(0).toUpperCase() + inc.slice(1)}-income`}
                        baseline={b}
                        scenario={s ?? b}
                        unit=" min"
                        better="lower"
                        hideScenario={!result.has_proposed_lines}
                      />
                    );
                  })}
                </div>

                <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700">
                  <p className="font-semibold mb-0.5">Equity score methodology</p>
                  <p className="text-violet-600 leading-relaxed">
                    Time savings weighted by transit dependency and income bracket.
                    Low-income agents have 1.5× weight; high-income 0.5×. Normalised to 100.
                  </p>
                </div>
              </div>
            )}

            {/* ── Stress tab ── */}
            {activeTab === "stress" && (
              <div className="space-y-3">
                {/* Proposed line stress */}
                {result.has_proposed_lines && result.line_stress.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                      Proposed line load
                    </p>
                    <div className="rounded-xl border border-stone-100 px-3 py-1 divide-y divide-stone-50">
                      {result.line_stress.map((seg, i) => (
                        <StressBar key={i} segment={seg} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Existing network stress */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                    {result.has_proposed_lines ? "Busiest existing segments" : "Network stress (busiest segments)"}
                  </p>
                  {result.baseline_edge_stress.length === 0 ? (
                    <p className="text-xs text-stone-400 py-2 text-center">No stress data — agents may not be routing through existing stops.</p>
                  ) : (
                    <div className="rounded-xl border border-stone-100 px-3 py-1 divide-y divide-stone-50 max-h-64 overflow-y-auto">
                      {result.baseline_edge_stress.map((seg, i) => (
                        <StressBar key={i} segment={seg} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 text-[10px] text-stone-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Low
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-400" /> Medium
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> High
                  </span>
                </div>
              </div>
            )}

            {/* ── Narrative tab (only when proposed lines) ── */}
            {activeTab === "narrative" && result.has_proposed_lines && (
              <div className="space-y-3">
                {result.narrative ? (
                  <div className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                    {result.narrative}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400 text-center py-4">
                    No narrative generated (API key not set or narration disabled).
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
