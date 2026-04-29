"""
Scenario narration via Claude.

Takes the structured comparison dict from scorer.py and produces a concise
plain-English summary (~150-250 words). One API call per scenario evaluation.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env", override=False)

_CLAUDE_KEY = (
    os.environ.get("ANTHROPIC_API_KEY")
    or os.environ.get("CLAUDE_KEY")
    or os.environ.get("CLAUDE_API_KEY")
    or ""
)

_NARRATOR_MODEL = "claude-haiku-4-5-20251001"   # cheapest, sufficient for narration

_SYSTEM = (
    "You are a transit planning analyst summarising simulation results for a "
    "Toronto transit planning tool. Write concise, data-driven commentary in "
    "plain English. Be specific about numbers. Avoid jargon. 2–3 short paragraphs."
)


def build_prompt(results: dict[str, Any], scenario_name: str) -> str:
    b = results["baseline"]
    s = results["scenario"]
    d = results["delta"]
    eq = results["equity"]
    stress = results.get("line_stress", [])
    n = results.get("agent_count", 0)

    stress_summary = ""
    if stress:
        top = stress[0]
        stress_summary = (
            f"The busiest proposed segment is {top['from_stop']} → {top['to_stop']} "
            f"with {top['agent_trips']} simulated trips ({top['stress_pct']}% of peak load)."
        )

    return f"""Scenario: "{scenario_name}"
Simulated agents: {n}

Baseline network:
- Transit accessible: {b['pct_accessible']}% of agents
- Avg transit time: {b['avg_transit_time_min']} min (total door-to-door: {b['avg_total_time_min']} min)
- Avg transfers: {b['avg_transfers']}
- Equity score: {eq['baseline_score']}/100

With proposed lines:
- Transit accessible: {s['pct_accessible']}% of agents (+{d['accessibility_gain_pct']}%)
- Avg transit time: {s['avg_transit_time_min']} min (total door-to-door: {s['avg_total_time_min']} min)
- Avg transfers: {s['avg_transfers']}
- Equity score: {eq['scenario_score']}/100 (+{d['equity_improvement']} pts)
- Newly accessible agents: {d['newly_accessible_agents']}

Time saved: {d['time_saved_min']} min avg transit time, {d['total_time_saved_min']} min avg door-to-door
{stress_summary}

Income-based door-to-door times (baseline → scenario):
{_income_table(b, s)}

Write a 2–3 paragraph analysis of what these results mean for Toronto commuters.
Focus on: which groups benefit most, line stress implications, and one concrete recommendation."""


def _income_table(b: dict, s: dict) -> str:
    lines = []
    for bracket in ("low", "mid", "high"):
        bt = b["income_breakdown"].get(bracket)
        st = s["income_breakdown"].get(bracket)
        if bt and st:
            lines.append(f"  {bracket}-income: {bt:.1f} min → {st:.1f} min (saves {bt - st:.1f} min)")
    return "\n".join(lines) if lines else "  (no breakdown available)"


async def narrate(results: dict[str, Any], scenario_name: str = "Proposed Lines") -> str:
    """Return a plain-English narrative string. Falls back to a template if no API key."""
    if not _CLAUDE_KEY:
        return _fallback_narrative(results, scenario_name)

    client = anthropic.AsyncAnthropic(api_key=_CLAUDE_KEY)
    prompt = build_prompt(results, scenario_name)

    message = await client.messages.create(
        model=_NARRATOR_MODEL,
        max_tokens=512,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _fallback_narrative(results: dict[str, Any], scenario_name: str) -> str:
    d = results["delta"]
    eq = results["equity"]
    b = results["baseline"]
    s = results["scenario"]
    return (
        f'The "{scenario_name}" scenario shows an average transit time saving of '
        f'{d["time_saved_min"]} minutes per commuter, with accessibility improving '
        f'from {b["pct_accessible"]}% to {s["pct_accessible"]}% of simulated agents. '
        f'{d["newly_accessible_agents"]} agents gain transit access they did not have before. '
        f'The equity score improved by {d["equity_improvement"]} points (to {eq["scenario_score"]}/100), '
        f'indicating {("meaningful" if d["equity_improvement"] > 5 else "modest")} benefits '
        f'for low-income and transit-dependent residents.'
    )
