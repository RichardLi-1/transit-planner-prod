"""
Agent population synthesis for transit simulation.

Generates N synthetic residents distributed across Toronto proportional to
population density (from can_pop.geojson). Each agent has:
  - home coords (sampled by density weight)
  - work coords (sampled from employment cluster pool)
  - income_bracket: "low" | "mid" | "high"
  - transit_dependency: 0.0–1.0
  - peak_departure_hour: typical morning departure time

No LLM calls are made here — agents are generated deterministically from
persona archetypes + density-weighted random sampling.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

# ── Constants ─────────────────────────────────────────────────────────────────

TORONTO_BBOX = (-79.70, 43.40, -79.10, 43.90)

# Major Toronto employment clusters [name, lon, lat, share of workforce]
EMPLOYMENT_CLUSTERS: list[dict[str, Any]] = [
    {"name": "Downtown Core",          "lon": -79.382, "lat": 43.649, "weight": 0.32},
    {"name": "University Ave (Hosp.)", "lon": -79.390, "lat": 43.658, "weight": 0.07},
    {"name": "Yonge & Bloor",          "lon": -79.385, "lat": 43.671, "weight": 0.08},
    {"name": "Midtown Yonge/Eglinton", "lon": -79.398, "lat": 43.705, "weight": 0.08},
    {"name": "North York Centre",      "lon": -79.411, "lat": 43.761, "weight": 0.07},
    {"name": "Scarborough Town Ctr",   "lon": -79.259, "lat": 43.774, "weight": 0.06},
    {"name": "Etobicoke Centre",       "lon": -79.548, "lat": 43.644, "weight": 0.06},
    {"name": "Airport / Pearson",      "lon": -79.616, "lat": 43.677, "weight": 0.05},
    {"name": "Liberty Village",        "lon": -79.420, "lat": 43.640, "weight": 0.05},
    {"name": "East York / Danforth",   "lon": -79.330, "lat": 43.680, "weight": 0.04},
    {"name": "Local (same area)",      "lon": None,    "lat": None,   "weight": 0.12},
]

# Persona archetypes — define how income and transit dependency vary.
# Assigned to agents based on home-area density bucket.
ARCHETYPES: list[dict[str, Any]] = [
    # High-density areas (inner city)
    {"id": "urban_lowinc",  "income": "low",  "transit_dep": 0.90, "depart_h": 7.0,  "density_min": 8000},
    {"id": "urban_midinc",  "income": "mid",  "transit_dep": 0.70, "depart_h": 8.5,  "density_min": 5000},
    {"id": "urban_highinc", "income": "high", "transit_dep": 0.45, "depart_h": 9.0,  "density_min": 3000},
    {"id": "student",       "income": "low",  "transit_dep": 0.95, "depart_h": 8.0,  "density_min": 2000},
    # Medium-density areas (inner suburbs)
    {"id": "sub_lowinc",    "income": "low",  "transit_dep": 0.65, "depart_h": 6.5,  "density_min": 800},
    {"id": "sub_midinc",    "income": "mid",  "transit_dep": 0.40, "depart_h": 8.0,  "density_min": 400},
    {"id": "sub_highinc",   "income": "high", "transit_dep": 0.20, "depart_h": 9.0,  "density_min": 200},
    # Low-density / outer suburbs
    {"id": "outer_lowinc",  "income": "low",  "transit_dep": 0.50, "depart_h": 6.0,  "density_min": 0},
    {"id": "outer_midinc",  "income": "mid",  "transit_dep": 0.25, "depart_h": 8.0,  "density_min": 0},
    {"id": "outer_highinc", "income": "high", "transit_dep": 0.10, "depart_h": 9.0,  "density_min": 0},
]

# Jitter in degrees (~90 m) applied to work cluster coords so agents don't
# all share the exact same destination node in the graph.
_WORK_JITTER_DEG = 0.001


@dataclass
class Agent:
    agent_id: int
    home_lon: float
    home_lat: float
    work_lon: float
    work_lat: float
    work_cluster: str
    income: str              # "low" | "mid" | "high"
    transit_dep: float       # 0.0–1.0
    depart_hour: float       # morning departure hour (24h)
    archetype_id: str
    home_density: float      # population density at home grid cell


# ── Helpers ───────────────────────────────────────────────────────────────────

def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _pick_archetype(density: float) -> dict[str, Any]:
    """Return the highest-density-threshold archetype that still fits.
    Uses a random draw weighted 40/40/20 (low/mid/high income) within the
    density band for variety.
    """
    candidates = [a for a in ARCHETYPES if density >= a["density_min"]]
    # Sort descending by density_min so most specific comes first
    candidates.sort(key=lambda a: a["density_min"], reverse=True)
    # Take the top density band that matches
    top_min = candidates[0]["density_min"]
    band = [c for c in candidates if c["density_min"] == top_min]
    return random.choice(band)


def _pick_work_location(
    home_lon: float,
    home_lat: float,
    rng: random.Random,
) -> tuple[float, float, str]:
    """Sample an employment cluster (weighted), jitter, return (lon, lat, name)."""
    clusters = EMPLOYMENT_CLUSTERS
    weights = [c["weight"] for c in clusters]
    chosen = rng.choices(clusters, weights=weights, k=1)[0]

    if chosen["lon"] is None:
        # "Local" cluster — work near home
        lon = home_lon + rng.gauss(0, 0.005)
        lat = home_lat + rng.gauss(0, 0.005)
        return lon, lat, chosen["name"]

    lon = chosen["lon"] + rng.uniform(-_WORK_JITTER_DEG, _WORK_JITTER_DEG)
    lat = chosen["lat"] + rng.uniform(-_WORK_JITTER_DEG, _WORK_JITTER_DEG)
    return lon, lat, chosen["name"]


# ── Population GeoJSON loader ─────────────────────────────────────────────────

_POP_PATH = Path(__file__).resolve().parents[3] / "can_pop.geojson"


@lru_cache(maxsize=1)
def _load_toronto_density_points() -> list[tuple[float, float, float]]:
    """Return list of (lon, lat, density) for all Toronto-area grid cells."""
    with open(_POP_PATH, encoding="utf-8") as f:
        fc = json.load(f)

    min_lon, min_lat, max_lon, max_lat = TORONTO_BBOX
    pts: list[tuple[float, float, float]] = []
    for feat in fc["features"]:
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            d = float(feat["properties"].get("d", 1.0))
            pts.append((lon, lat, d))
    return pts


# ── Public API ────────────────────────────────────────────────────────────────

def generate_agents(n: int = 1000, seed: int = 42) -> list[Agent]:
    """
    Generate n synthetic agent records.

    Agents are placed at density-grid points weighted by population density,
    then assigned a work cluster and persona archetype. Fully deterministic
    given the same seed.
    """
    rng = random.Random(seed)
    pts = _load_toronto_density_points()
    if not pts:
        raise RuntimeError("No Toronto density points found in can_pop.geojson")

    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    densities = [p[2] for p in pts]

    # Sample home locations proportional to density
    chosen_indices = rng.choices(range(len(pts)), weights=densities, k=n)

    agents: list[Agent] = []
    for i, idx in enumerate(chosen_indices):
        home_lon = lons[idx] + rng.uniform(-0.0005, 0.0005)  # sub-cell jitter
        home_lat = lats[idx] + rng.uniform(-0.0005, 0.0005)
        density = densities[idx]

        archetype = _pick_archetype(density)
        work_lon, work_lat, work_cluster = _pick_work_location(home_lon, home_lat, rng)

        # Slightly vary departure time around archetype mean (±45 min)
        depart_h = archetype["depart_h"] + rng.gauss(0, 0.25)

        agents.append(Agent(
            agent_id=i,
            home_lon=home_lon,
            home_lat=home_lat,
            work_lon=work_lon,
            work_lat=work_lat,
            work_cluster=work_cluster,
            income=archetype["income"],
            transit_dep=archetype["transit_dep"],
            depart_hour=round(depart_h, 2),
            archetype_id=archetype["id"],
            home_density=density,
        ))

    return agents
