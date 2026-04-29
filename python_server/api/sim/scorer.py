"""
Scenario scoring.

Compares baseline routing results vs scenario routing results and produces
a structured metrics dict that includes:
  - Transit time statistics (mean, median, p90)
  - Accessibility rate (% of agents with a feasible transit path)
  - Equity score (weighted time savings for low-income / transit-dependent agents)
  - Line stress per proposed-line edge (agent-trips / theoretical capacity)
  - Per-agent time deltas (for map visualisation)
"""

from __future__ import annotations

import math
import statistics
from collections import Counter
from dataclasses import dataclass
from typing import Any

from .population import Agent
from .router import TripResult


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_mean(values: list[float]) -> float:
    return statistics.mean(values) if values else 0.0


def _safe_median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = (p / 100) * (len(s) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (idx - lo) * (s[hi] - s[lo])


# ── Per-run snapshot ───────────────────────────────────────────────────────────

@dataclass
class RunSnapshot:
    """Aggregated statistics for one routing run (baseline or scenario)."""
    agent_count: int
    feasible_count: int
    pct_accessible: float       # 0–100
    avg_transit_time_min: float
    median_transit_time_min: float
    p90_transit_time_min: float
    avg_total_time_min: float   # includes walk
    avg_transfers: float
    avg_car_time_min: float     # baseline car estimate for comparison
    income_breakdown: dict[str, float]  # income → avg total time
    edge_load: dict[int, int]   # edge_pk → agent-trip count


def snapshot(agents: list[Agent], results: list[TripResult]) -> RunSnapshot:
    """Compute a RunSnapshot from an agent list and their routing results."""
    feasible = [r for r in results if r.feasible]
    total_times = [r.total_time_min for r in feasible]
    transit_times = [r.transit_time_min for r in feasible]
    transfers = [r.transfers for r in feasible]
    car_times = [r.car_time_min for r in results]

    # Income breakdown: avg total_time_min per income bracket
    income_groups: dict[str, list[float]] = {}
    agent_map = {a.agent_id: a for a in agents}
    for r in feasible:
        a = agent_map.get(r.agent_id)
        if a:
            income_groups.setdefault(a.income, []).append(r.total_time_min)
    income_breakdown = {k: round(_safe_mean(v), 2) for k, v in income_groups.items()}

    # Edge load count
    edge_load: dict[int, int] = Counter()
    for r in results:
        for ep in r.edge_pks_used:
            edge_load[ep] += 1

    return RunSnapshot(
        agent_count=len(results),
        feasible_count=len(feasible),
        pct_accessible=round(len(feasible) / max(len(results), 1) * 100, 1),
        avg_transit_time_min=round(_safe_mean(transit_times), 2),
        median_transit_time_min=round(_safe_median(transit_times), 2),
        p90_transit_time_min=round(_percentile(transit_times, 90), 2),
        avg_total_time_min=round(_safe_mean(total_times), 2),
        avg_transfers=round(_safe_mean(transfers), 2),
        avg_car_time_min=round(_safe_mean(car_times), 2),
        income_breakdown=income_breakdown,
        edge_load=dict(edge_load),
    )


# ── Equity score ──────────────────────────────────────────────────────────────

def equity_score(agents: list[Agent], results: list[TripResult]) -> float:
    """
    Compute a 0–100 equity score.

    Rewards time savings for low-income and high-transit-dependency agents.
    Score = weighted mean of (car_time - transit_time) for feasible trips,
    where weight = transit_dep * income_weight(income).

    Returns 0–100 (higher = better for equity).
    """
    income_weight = {"low": 1.5, "mid": 1.0, "high": 0.5}
    agent_map = {a.agent_id: a for a in agents}
    weighted_savings: list[float] = []

    for r in results:
        if not r.feasible:
            continue
        a = agent_map.get(r.agent_id)
        if not a:
            continue
        saving = r.car_time_min - r.total_time_min  # positive = transit saves time
        iw = income_weight.get(a.income, 1.0)
        weight = a.transit_dep * iw
        weighted_savings.append(saving * weight)

    if not weighted_savings:
        return 0.0

    raw = _safe_mean(weighted_savings)
    # Normalise to 0–100: assume 30 min max weighted saving = 100
    return round(min(100.0, max(0.0, raw / 30 * 100)), 1)


# ── Line stress ────────────────────────────────────────────────────────────────

def compute_line_stress(
    proposed_lines: list[dict[str, Any]],
    scenario_results: list[TripResult],
    scenario_graph_stops: dict[int, dict[str, Any]],
    scenario_G: Any,  # nx.DiGraph
) -> list[dict[str, Any]]:
    """
    For each consecutive stop-pair in proposed lines, count how many agent
    paths traverse that edge.

    Returns a list of stress records:
    [
      {
        "line_name": "Relief Line",
        "from_stop": "Pape",
        "to_stop": "Broadview",
        "from_coords": [-79.352, 43.679],
        "to_coords": [-79.362, 43.669],
        "agent_trips": 42,
        "stress_pct": 84.0   # relative to busiest proposed edge
      }
    ]
    """
    # Build set of virtual node pairs on proposed lines
    # We need to reconstruct what virtual IDs were assigned.
    # The scenario graph encodes proposed edges with edge_kind="proposed".
    proposed_edges: list[dict[str, Any]] = []
    for u, v, data in scenario_G.edges(data=True):
        if data.get("edge_kind") == "proposed" and u < 0:
            proposed_edges.append({
                "u": u, "v": v, "data": data,
            })

    if not proposed_edges:
        return []

    # Build set of all node sequences that appear in agent paths
    path_edge_set: Counter = Counter()
    for r in scenario_results:
        pn = r.path_nodes
        for a, b in zip(pn, pn[1:]):
            path_edge_set[(a, b)] += 1

    # Count agents on each proposed edge
    stress_records: list[dict[str, Any]] = []
    for pe in proposed_edges:
        u, v = pe["u"], pe["v"]
        count = path_edge_set.get((u, v), 0)
        u_meta = scenario_graph_stops.get(u, {})
        v_meta = scenario_graph_stops.get(v, {})
        stress_records.append({
            "line_name": pe["data"].get("line_name", ""),
            "from_stop": u_meta.get("stop_name", str(u)),
            "to_stop":   v_meta.get("stop_name", str(v)),
            "from_coords": [u_meta.get("lon", 0), u_meta.get("lat", 0)],
            "to_coords":   [v_meta.get("lon", 0), v_meta.get("lat", 0)],
            "agent_trips": count,
        })

    # Normalise to stress_pct relative to busiest segment
    max_trips = max((s["agent_trips"] for s in stress_records), default=1)
    for s in stress_records:
        s["stress_pct"] = round(s["agent_trips"] / max(max_trips, 1) * 100, 1)

    # Sort by agent_trips descending
    stress_records.sort(key=lambda x: x["agent_trips"], reverse=True)
    return stress_records


# ── All-edge stress (existing network) ────────────────────────────────────────

def compute_all_edge_stress(
    results: list[TripResult],
    G: Any,   # nx.DiGraph
    top_n: int = 80,
) -> list[dict[str, Any]]:
    """
    Return the top_n most-loaded existing transit edges from a routing run.

    Each entry: {from_stop, to_stop, from_coords, to_coords, agent_trips, stress_pct}
    Only includes edges with edge_kind="transit" (not walking edges).
    """
    # Count agent-trips per directed edge pair (not edge_pk — virtual nodes have none)
    pair_count: Counter = Counter()
    for r in results:
        pn = r.path_nodes
        for a, b in zip(pn, pn[1:]):
            data = G.get_edge_data(a, b, default={})
            if data.get("edge_kind") == "transit":
                pair_count[(a, b)] += 1

    if not pair_count:
        return []

    # Build stress records from graph edge attributes
    records: list[dict[str, Any]] = []
    for (a, b), count in pair_count.most_common(top_n):
        data = G.get_edge_data(a, b, default={})
        records.append({
            "from_stop": data.get("from_name", str(a)),
            "to_stop":   data.get("to_name",   str(b)),
            "from_coords": [data.get("from_lon", 0.0), data.get("from_lat", 0.0)],
            "to_coords":   [data.get("to_lon",   0.0), data.get("to_lat",   0.0)],
            "agent_trips": count,
            "edge_pk": data.get("edge_pk"),
        })

    max_trips = records[0]["agent_trips"] if records else 1
    for r in records:
        r["stress_pct"] = round(r["agent_trips"] / max_trips * 100, 1)

    return records


# ── Top-level comparison ───────────────────────────────────────────────────────

def compare_scenarios(
    agents: list[Agent],
    baseline_results: list[TripResult],
    scenario_results: list[TripResult],
    proposed_lines: list[dict[str, Any]],
    baseline_G: Any,
    scenario_G: Any,
    scenario_stops: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    """
    Produce the full comparison dict returned by the simulation API.
    """
    has_proposed = bool(proposed_lines)
    base_snap = snapshot(agents, baseline_results)
    scen_snap = snapshot(agents, scenario_results)
    base_equity = equity_score(agents, baseline_results)
    scen_equity = equity_score(agents, scenario_results)

    # Proposed-line stress (only when new lines were added)
    stress = compute_line_stress(proposed_lines, scenario_results, scenario_stops, scenario_G) if has_proposed else []
    # All-edge stress from the baseline (always shown — reveals busiest existing segments)
    baseline_edge_stress = compute_all_edge_stress(baseline_results, baseline_G, top_n=80)

    # Per-agent time delta list (for frontend dot colouring)
    base_map = {r.agent_id: r for r in baseline_results}
    scen_map = {r.agent_id: r for r in scenario_results}
    per_agent: list[dict[str, Any]] = []
    for a in agents:
        b = base_map.get(a.agent_id)
        s = scen_map.get(a.agent_id)
        if b and s:
            delta = b.total_time_min - s.total_time_min
            per_agent.append({
                "home_lon": a.home_lon,
                "home_lat": a.home_lat,
                "income": a.income,
                "transit_dep": a.transit_dep,
                "baseline_time": b.total_time_min,
                "scenario_time": s.total_time_min,
                "time_saved_min": round(delta, 2),
                "newly_accessible": (not b.feasible and s.feasible),
            })

    newly_accessible_count = sum(1 for p in per_agent if p["newly_accessible"])

    def _snap_dict(sn: RunSnapshot) -> dict[str, Any]:
        return {
            "pct_accessible": sn.pct_accessible,
            "avg_transit_time_min": sn.avg_transit_time_min,
            "median_transit_time_min": sn.median_transit_time_min,
            "p90_transit_time_min": sn.p90_transit_time_min,
            "avg_total_time_min": sn.avg_total_time_min,
            "avg_transfers": sn.avg_transfers,
            "avg_car_time_min": sn.avg_car_time_min,
            "income_breakdown": sn.income_breakdown,
        }

    return {
        "baseline": _snap_dict(base_snap),
        "scenario": _snap_dict(scen_snap),
        "has_proposed_lines": has_proposed,
        "delta": {
            "time_saved_min": round(base_snap.avg_transit_time_min - scen_snap.avg_transit_time_min, 2),
            "total_time_saved_min": round(base_snap.avg_total_time_min - scen_snap.avg_total_time_min, 2),
            "accessibility_gain_pct": round(scen_snap.pct_accessible - base_snap.pct_accessible, 1),
            "transfer_reduction": round(base_snap.avg_transfers - scen_snap.avg_transfers, 2),
            "equity_improvement": round(scen_equity - base_equity, 1),
            "newly_accessible_agents": newly_accessible_count,
        },
        "equity": {
            "baseline_score": base_equity,
            "scenario_score": scen_equity,
        },
        "line_stress": stress,                          # proposed-line segments only
        "baseline_edge_stress": baseline_edge_stress,   # top loaded existing edges
        "per_agent": per_agent,
        "agent_count": len(agents),
    }
