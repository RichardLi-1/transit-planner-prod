"""
Origin-Destination router for synthetic agents.

For each agent trip (home → work), this module:
  1. Finds the nearest stop within ACCESS_WALK_M of home (access walk)
  2. Finds the nearest stop within ACCESS_WALK_M of work (egress walk)
  3. Runs Dijkstra shortest-path between those two stops
  4. Total trip time = access_walk + transit_path_time + egress_walk
  5. If no stop is reachable from home or work, the trip is "not accessible"

All routing is done synchronously with NetworkX; call from a thread pool
in async contexts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from .population import Agent

# ── Constants ──────────────────────────────────────────────────────────────────

# Max walk distance to first/last stop (metres)
ACCESS_WALK_M = 800

WALK_SPEED_MPS = 5 / 3.6   # 5 km/h

# Car travel speed in Toronto (for "no transit" fallback estimate)
CAR_SPEED_KMH = 25.0        # congested city average


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _walk_time_min(dist_m: float) -> float:
    return (dist_m / WALK_SPEED_MPS) / 60


# ── Results ────────────────────────────────────────────────────────────────────

@dataclass
class TripResult:
    agent_id: int
    feasible: bool           # True if a transit path was found
    total_time_min: float    # door-to-door minutes (transit) or car estimate
    transit_time_min: float  # in-vehicle time only
    access_walk_min: float   # walk to first stop
    egress_walk_min: float   # walk from last stop
    transfers: int           # number of line changes
    path_nodes: list[int]    # stop_pk sequence of the route taken
    car_time_min: float      # straight-line car time estimate (for comparison)
    edge_pks_used: list[int] = field(default_factory=list)  # DB edge_pks on path


# ── Spatial nearest-stop index ─────────────────────────────────────────────────

class _StopIndex:
    """Lightweight tile-based spatial index over graph nodes."""

    def __init__(self, G: nx.DiGraph, stop_meta: dict[int, dict[str, Any]]) -> None:
        self._meta = stop_meta
        self._tile: dict[tuple[int, int], list[int]] = {}
        for pk, meta in stop_meta.items():
            lon, lat = meta["lon"], meta["lat"]
            key = (int(lon * 100), int(lat * 100))
            self._tile.setdefault(key, []).append(pk)

    def nearest_within(
        self,
        lon: float,
        lat: float,
        max_dist_m: float,
    ) -> tuple[int, float] | None:
        """Return (stop_pk, dist_m) of the closest stop within max_dist_m, or None."""
        cx = int(lon * 100)
        cy = int(lat * 100)
        # Search surrounding tiles (2 tiles = ~2.2 km radius, enough for 800 m)
        radius = math.ceil(max_dist_m / 1000 * 1.1)
        candidates: list[tuple[int, float]] = []
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                for pk in self._tile.get((cx + dx, cy + dy), []):
                    m = self._meta[pk]
                    d = _haversine_m(lon, lat, m["lon"], m["lat"])
                    if d <= max_dist_m:
                        candidates.append((pk, d))
        if not candidates:
            return None
        return min(candidates, key=lambda x: x[1])


# ── Transfer count ─────────────────────────────────────────────────────────────

def _count_transfers(G: nx.DiGraph, path: list[int]) -> int:
    """
    Estimate line changes along a path.

    A transfer is counted when consecutive edges switch from one route_type
    to another non-walking type (or between different line names).
    """
    if len(path) < 2:
        return 0
    transfers = 0
    prev_line = None
    for i in range(len(path) - 1):
        data = G.get_edge_data(path[i], path[i + 1], default={})
        kind = data.get("edge_kind", "transit")
        if kind == "walk":
            # Walking between stops counts as a transfer
            transfers += 1
            prev_line = None
        else:
            cur_line = data.get("line_name") or data.get("route_type")
            if prev_line is not None and cur_line != prev_line:
                transfers += 1
            prev_line = cur_line
    return transfers


# ── Core routing function ──────────────────────────────────────────────────────

def route_agent(
    agent: Agent,
    G: nx.DiGraph,
    stop_meta: dict[int, dict[str, Any]],
    idx: "_StopIndex",
) -> TripResult:
    """
    Route a single agent home → work.

    Returns a TripResult regardless of whether transit is feasible.
    """
    car_dist_m = _haversine_m(
        agent.home_lon, agent.home_lat,
        agent.work_lon, agent.work_lat,
    )
    car_time_min = (car_dist_m / 1000) / CAR_SPEED_KMH * 60

    # Find nearest stops
    access = idx.nearest_within(agent.home_lon, agent.home_lat, ACCESS_WALK_M)
    egress = idx.nearest_within(agent.work_lon, agent.work_lat, ACCESS_WALK_M)

    if access is None or egress is None:
        return TripResult(
            agent_id=agent.agent_id,
            feasible=False,
            total_time_min=car_time_min,
            transit_time_min=0.0,
            access_walk_min=0.0,
            egress_walk_min=0.0,
            transfers=0,
            path_nodes=[],
            car_time_min=car_time_min,
        )

    access_pk, access_dist = access
    egress_pk, egress_dist = egress

    access_walk = _walk_time_min(access_dist)
    egress_walk = _walk_time_min(egress_dist)

    # Same stop → trivial walk
    if access_pk == egress_pk:
        return TripResult(
            agent_id=agent.agent_id,
            feasible=True,
            total_time_min=access_walk + egress_walk,
            transit_time_min=0.0,
            access_walk_min=access_walk,
            egress_walk_min=egress_walk,
            transfers=0,
            path_nodes=[access_pk],
            car_time_min=car_time_min,
        )

    # Dijkstra shortest path
    try:
        path_nodes: list[int] = nx.dijkstra_path(G, access_pk, egress_pk, weight="weight")
        transit_time: float = nx.dijkstra_path_length(G, access_pk, egress_pk, weight="weight")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return TripResult(
            agent_id=agent.agent_id,
            feasible=False,
            total_time_min=car_time_min,
            transit_time_min=0.0,
            access_walk_min=access_walk,
            egress_walk_min=egress_walk,
            transfers=0,
            path_nodes=[],
            car_time_min=car_time_min,
        )

    transfers = _count_transfers(G, path_nodes)
    total = access_walk + transit_time + egress_walk

    # Collect edge_pks used (for stress accounting)
    edge_pks: list[int] = []
    for a, b in zip(path_nodes, path_nodes[1:]):
        ep = G.get_edge_data(a, b, default={}).get("edge_pk")
        if ep is not None:
            edge_pks.append(ep)

    return TripResult(
        agent_id=agent.agent_id,
        feasible=True,
        total_time_min=round(total, 2),
        transit_time_min=round(transit_time, 2),
        access_walk_min=round(access_walk, 2),
        egress_walk_min=round(egress_walk, 2),
        transfers=transfers,
        path_nodes=path_nodes,
        car_time_min=round(car_time_min, 2),
        edge_pks_used=edge_pks,
    )


def route_all_agents(
    agents: list[Agent],
    G: nx.DiGraph,
    stop_meta: dict[int, dict[str, Any]],
) -> list[TripResult]:
    """Route all agents through graph G. Returns one TripResult per agent."""
    idx = _StopIndex(G, stop_meta)
    return [route_agent(a, G, stop_meta, idx) for a in agents]
