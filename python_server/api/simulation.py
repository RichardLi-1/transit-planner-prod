"""
Simulation API endpoints.

POST /api/simulation/run
  Accepts proposed transit lines, runs the agent population simulation,
  and returns a baseline-vs-scenario comparison with line stress and narration.

GET /api/simulation/status
  Returns whether the transit graph is loaded and how many DB stops/edges are cached.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .sim.graph import get_baseline_graph, build_scenario_graph
from .sim.population import generate_agents, Agent
from .sim.router import route_all_agents
from .sim.scorer import compare_scenarios
from .sim.narrator import narrate

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# ── Request / Response models ──────────────────────────────────────────────────

class ProposedStop(BaseModel):
    name: str
    coords: list[float]   # [lon, lat]


class ProposedLine(BaseModel):
    name: str
    type: str = "bus"     # subway | lrt | streetcar | bus | go_train
    stops: list[ProposedStop]


class SimulationRequest(BaseModel):
    proposed_lines: list[ProposedLine] = []
    agent_count: int = 500       # 200–2000 recommended
    scenario_name: str = "Baseline"
    seed: int = 42
    narrate: bool = True         # call Claude for narrative (costs ~$0.01)


class SimulationResponse(BaseModel):
    scenario_name: str
    agent_count: int
    run_duration_s: float
    has_proposed_lines: bool
    baseline: dict[str, Any]
    scenario: dict[str, Any]
    delta: dict[str, Any]
    equity: dict[str, Any]
    line_stress: list[dict[str, Any]]
    baseline_edge_stress: list[dict[str, Any]]
    per_agent: list[dict[str, Any]]
    narrative: str
    graph_stats: dict[str, Any]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status")
def simulation_status() -> dict[str, Any]:
    """Return graph load status without triggering a full simulation."""
    try:
        G, stops = get_baseline_graph()
        return {
            "graph_loaded": True,
            "stop_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
            "db_stop_count": len(stops),
        }
    except Exception as exc:
        return {"graph_loaded": False, "error": str(exc)}


@router.post("/run", response_model=SimulationResponse)
async def run_simulation(body: SimulationRequest) -> SimulationResponse:
    """
    Run the full agent simulation and return results.

    Works with zero proposed lines (baseline-only mode) or with proposed lines
    (baseline vs scenario comparison). The transit graph is built from the DB
    on the first call and cached module-wide. Routing runs in a thread pool.
    """
    agent_count = max(50, min(body.agent_count, 2000))
    t0 = time.perf_counter()

    # ── Build graphs ───────────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()

    try:
        baseline_G, base_stops = await loop.run_in_executor(
            None, get_baseline_graph
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not load transit graph from database: {exc}",
        )

    proposed_lines_raw = [
        {
            "name": pl.name,
            "type": pl.type,
            "stops": [{"name": s.name, "coords": s.coords} for s in pl.stops],
        }
        for pl in body.proposed_lines
    ]

    # Scenario graph = baseline + proposed lines (may be identical if no proposals)
    scenario_G, scenario_stops = await loop.run_in_executor(
        None, build_scenario_graph, proposed_lines_raw
    )

    # ── Generate agents ────────────────────────────────────────────────────────
    agents: list[Agent] = await loop.run_in_executor(
        None, generate_agents, agent_count, body.seed
    )

    # ── Route agents ───────────────────────────────────────────────────────────
    baseline_results = await loop.run_in_executor(
        None, route_all_agents, agents, baseline_G, base_stops
    )

    # Only re-route through the scenario graph if there are proposed lines
    if proposed_lines_raw:
        scenario_results = await loop.run_in_executor(
            None, route_all_agents, agents, scenario_G, scenario_stops
        )
    else:
        scenario_results = baseline_results

    # ── Score ──────────────────────────────────────────────────────────────────
    comparison = await loop.run_in_executor(
        None,
        compare_scenarios,
        agents,
        baseline_results,
        scenario_results,
        proposed_lines_raw,
        baseline_G,
        scenario_G,
        scenario_stops,
    )

    # ── Narrate ────────────────────────────────────────────────────────────────
    narrative_text = ""
    if body.narrate:
        try:
            narrative_text = await narrate(comparison, body.scenario_name)
        except Exception:
            narrative_text = ""

    run_duration = round(time.perf_counter() - t0, 2)

    return SimulationResponse(
        scenario_name=body.scenario_name,
        agent_count=len(agents),
        run_duration_s=run_duration,
        has_proposed_lines=comparison["has_proposed_lines"],
        baseline=comparison["baseline"],
        scenario=comparison["scenario"],
        delta=comparison["delta"],
        equity=comparison["equity"],
        line_stress=comparison["line_stress"],
        baseline_edge_stress=comparison["baseline_edge_stress"],
        per_agent=comparison["per_agent"],
        narrative=narrative_text,
        graph_stats={
            "baseline_nodes": baseline_G.number_of_nodes(),
            "baseline_edges": baseline_G.number_of_edges(),
            "scenario_nodes": scenario_G.number_of_nodes(),
            "scenario_edges": scenario_G.number_of_edges(),
        },
    )
