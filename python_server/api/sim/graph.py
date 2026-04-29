"""
Transit graph builder.

Loads all stops and directed network edges from the PostGIS database and
constructs a NetworkX DiGraph where:
  - Nodes  = stop_pk integers (also includes virtual nodes for proposed stops)
  - Edges  = directed transit legs; weight = travel time in minutes
  - Walking transfer edges are added between stops within WALK_TRANSFER_M metres

Proposed new lines are injected as additional virtual stops + edges. Their
travel times are estimated from Haversine distance and a speed lookup by
transit type.

The baseline graph is built once and cached at the module level. Scenario
graphs are shallow copies with the proposed edges added on top.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

import networkx as nx
from sqlalchemy import text

from python_utils.python_utils.db.session import engine

# ── Physics constants ──────────────────────────────────────────────────────────

WALK_TRANSFER_M = 400     # max walking distance to count as a transfer node
WALK_SPEED_MPS = 5 / 3.6  # 5 km/h in m/s

# Speed (km/h) per GTFS route_type for existing network edges
_SPEED_BY_TYPE: dict[int, float] = {
    0: 15.0,   # tram / streetcar
    1: 35.0,   # subway / metro
    2: 60.0,   # rail (GO)
    3: 20.0,   # bus
    4: 12.0,   # ferry
}
_DEFAULT_SPEED_KMH = 22.0

# Boarding penalty per route_type (minutes) — wait at origin stop
_BOARD_PENALTY: dict[int, float] = {
    0: 3.0,
    1: 2.0,
    2: 5.0,
    3: 4.0,
}
_DEFAULT_BOARD_PENALTY = 4.0

# Speed (km/h) for proposed lines by transit type string
_PROPOSED_SPEED: dict[str, float] = {
    "subway": 35.0,
    "lrt":    25.0,
    "streetcar": 15.0,
    "bus":    20.0,
    "go_train": 60.0,
}
_PROPOSED_BOARD_PENALTY: dict[str, float] = {
    "subway": 2.0,
    "lrt":    2.5,
    "streetcar": 3.0,
    "bus":    4.0,
    "go_train": 5.0,
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _travel_time_min(dist_m: float, route_type: int | None) -> float:
    """Estimate transit travel time in minutes from distance + route type."""
    speed_kmh = _SPEED_BY_TYPE.get(route_type or -1, _DEFAULT_SPEED_KMH)
    return (dist_m / 1000) / speed_kmh * 60


def _walk_time_min(dist_m: float) -> float:
    return (dist_m / WALK_SPEED_MPS) / 60


# ── Database loaders ───────────────────────────────────────────────────────────

def _load_stops() -> dict[int, dict[str, Any]]:
    """Return {stop_pk: {stop_pk, stop_name, lon, lat}}."""
    sql = text("""
        SELECT stop_pk, stop_name,
               ST_X(geom) AS lon, ST_Y(geom) AS lat
        FROM stops
    """)
    with engine.connect() as conn:
        rows = conn.execute(sql).mappings().all()
    return {r["stop_pk"]: dict(r) for r in rows}


def _load_edges() -> list[dict[str, Any]]:
    """Return all directed edges with estimated route_type."""
    sql = text("""
        SELECT DISTINCT ON (ne.edge_pk)
            ne.edge_pk,
            ne.from_stop_pk,
            ne.to_stop_pk,
            ne.length_m,
            r.route_type
        FROM network_edges ne
        LEFT JOIN pattern_edges pe ON pe.edge_pk = ne.edge_pk
        LEFT JOIN service_patterns sp ON sp.pattern_pk = pe.pattern_pk
        LEFT JOIN routes r ON r.route_pk = sp.route_pk
        ORDER BY ne.edge_pk, r.route_type
    """)
    with engine.connect() as conn:
        rows = conn.execute(sql).mappings().all()
    return [dict(r) for r in rows]


# ── Graph construction ─────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _build_baseline_graph() -> tuple[nx.DiGraph, dict[int, dict[str, Any]]]:
    """
    Build and cache the baseline transit graph.

    Returns (graph, stop_lookup) where stop_lookup maps stop_pk → metadata.
    The graph is cached at module level so only the first call hits the DB.
    """
    stops = _load_stops()
    edges = _load_edges()

    G: nx.DiGraph = nx.DiGraph()

    # Add all stop nodes
    for pk, meta in stops.items():
        G.add_node(pk, lon=meta["lon"], lat=meta["lat"], name=meta["stop_name"] or str(pk))

    # Add transit edges
    for e in edges:
        frm = e["from_stop_pk"]
        to  = e["to_stop_pk"]
        if frm not in stops or to not in stops:
            continue
        length_m = float(e["length_m"] or 0)
        s = stops[frm]
        t = stops[to]
        if length_m <= 0:
            length_m = _haversine_m(s["lon"], s["lat"], t["lon"], t["lat"])
        rt = e["route_type"]
        tt = _travel_time_min(length_m, rt)
        G.add_edge(frm, to,
                   weight=tt,
                   edge_pk=e["edge_pk"],
                   route_type=rt,
                   edge_kind="transit",
                   length_m=length_m,
                   from_lon=s["lon"], from_lat=s["lat"],
                   to_lon=t["lon"],   to_lat=t["lat"],
                   from_name=s.get("stop_name") or str(frm),
                   to_name=t.get("stop_name") or str(to))

    # Add walking transfer edges between close stops
    stop_list = list(stops.values())
    # Build a simple spatial index: bucket by 0.01° tiles
    tile: dict[tuple[int, int], list[dict]] = {}
    for s in stop_list:
        key = (int(s["lon"] * 100), int(s["lat"] * 100))
        tile.setdefault(key, []).append(s)

    for s in stop_list:
        cx = int(s["lon"] * 100)
        cy = int(s["lat"] * 100)
        neighbours: list[dict] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbours.extend(tile.get((cx + dx, cy + dy), []))
        for t in neighbours:
            if t["stop_pk"] == s["stop_pk"]:
                continue
            d = _haversine_m(s["lon"], s["lat"], t["lon"], t["lat"])
            if d <= WALK_TRANSFER_M:
                wt = _walk_time_min(d)
                # Only add walking edge if faster than existing transit edge
                if not G.has_edge(s["stop_pk"], t["stop_pk"]) or \
                   G[s["stop_pk"]][t["stop_pk"]]["weight"] > wt:
                    G.add_edge(s["stop_pk"], t["stop_pk"],
                               weight=wt,
                               edge_kind="walk",
                               length_m=d)

    return G, stops


def get_baseline_graph() -> tuple[nx.DiGraph, dict[int, dict[str, Any]]]:
    """Public accessor — returns (graph, stop_lookup)."""
    return _build_baseline_graph()


# ── Proposed line injection ────────────────────────────────────────────────────

def build_scenario_graph(
    proposed_lines: list[dict[str, Any]],
) -> tuple[nx.DiGraph, dict[int, dict[str, Any]]]:
    """
    Return a copy of the baseline graph augmented with proposed line edges.

    proposed_lines format:
    [
      {
        "name": "Relief Line",
        "type": "subway",
        "stops": [
          {"name": "Pape", "coords": [-79.352, 43.679]},
          ...
        ]
      }
    ]

    Virtual stop nodes are assigned negative IDs (starting at -1) so they
    don't collide with real stop_pks. Walking transfer edges are added to
    the nearest real stops within WALK_TRANSFER_M.
    """
    base_G, base_stops = get_baseline_graph()
    G: nx.DiGraph = base_G.copy()
    stops: dict[int, dict[str, Any]] = dict(base_stops)

    # Real stop list for transfer detection
    real_stop_list = list(base_stops.values())

    virtual_id = -1  # decrements for each virtual stop

    for line in proposed_lines:
        line_type: str = line.get("type", "bus")
        speed_kmh = _PROPOSED_SPEED.get(line_type, 22.0)
        board_pen = _PROPOSED_BOARD_PENALTY.get(line_type, 4.0)
        line_stops: list[dict] = line.get("stops", [])

        prev_pk: int | None = None
        for stop_def in line_stops:
            lon, lat = stop_def["coords"]
            name = stop_def.get("name", f"Virtual-{abs(virtual_id)}")

            v_pk = virtual_id
            virtual_id -= 1

            G.add_node(v_pk, lon=lon, lat=lat, name=name, virtual=True)
            stops[v_pk] = {"stop_pk": v_pk, "stop_name": name, "lon": lon, "lat": lat}

            # Walking transfer edges to nearby real stops
            for rs in real_stop_list:
                d = _haversine_m(lon, lat, rs["lon"], rs["lat"])
                if d <= WALK_TRANSFER_M:
                    wt = _walk_time_min(d)
                    G.add_edge(v_pk, rs["stop_pk"], weight=wt, edge_kind="walk", length_m=d)
                    G.add_edge(rs["stop_pk"], v_pk, weight=wt, edge_kind="walk", length_m=d)

            # Transit edge from previous proposed stop
            if prev_pk is not None:
                prev = stops[prev_pk]
                d = _haversine_m(prev["lon"], prev["lat"], lon, lat)
                tt = (d / 1000) / speed_kmh * 60
                # Both directions (proposed lines are bidirectional)
                G.add_edge(prev_pk, v_pk,
                           weight=tt + board_pen,
                           edge_kind="proposed",
                           line_name=line.get("name"),
                           line_type=line_type,
                           length_m=d)
                G.add_edge(v_pk, prev_pk,
                           weight=tt + board_pen,
                           edge_kind="proposed",
                           line_name=line.get("name"),
                           line_type=line_type,
                           length_m=d)

            prev_pk = v_pk

    return G, stops
