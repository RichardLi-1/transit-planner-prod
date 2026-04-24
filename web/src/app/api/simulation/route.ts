import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runSimulation, type SimulationResult, type StressSegment, type TransitSpeedData } from "~/server/simulation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Narrative generation ───────────────────────────────────────────────────────

async function generateNarrative(result: SimulationResult, scenarioName: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "";

  const client = new Anthropic({ apiKey: key });
  const d = result.delta;
  const b = result.baseline;
  const s = result.scenario;

  const prompt = `You are a transit planning analyst. Write a concise 3-paragraph plain-English assessment of this scenario comparison for Toronto transit planners.

Scenario: "${scenarioName}"
Agents routed: ${result.agentCount}

Baseline: ${b.pctAccessible}% accessible, avg ${b.avgTransitMin} min transit, avg ${b.avgTransfers} transfers
Scenario: ${s.pctAccessible}% accessible, avg ${s.avgTransitMin} min transit, avg ${s.avgTransfers} transfers

Delta: ${d.timeSavedMin > 0 ? `${d.timeSavedMin} min saved per rider` : `${Math.abs(d.timeSavedMin)} min added per rider`}, ${d.newlyAccessibleAgents} agents newly reached, equity ${d.equityImprovement > 0 ? "improved" : "worsened"} by ${Math.abs(d.equityImprovement)} points.

Paragraph 1: Overall effectiveness summary. Paragraph 2: Equity and access implications. Paragraph 3: Key recommendation for planners. Keep it factual, under 200 words total.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    return block?.type === "text" ? block.text : "";
  } catch {
    return "";
  }
}

// ── Field name conversion ──────────────────────────────────────────────────────

function convertStressSegment(seg: StressSegment) {
  return {
    line_name: seg.lineName,
    from_stop: seg.fromStop,
    to_stop: seg.toStop,
    from_coords: seg.fromCoords,
    to_coords: seg.toCoords,
    agent_trips: seg.agentTrips,
    baseline_trips: seg.baselineTrips,
    stress_pct: seg.stressPct,
    delta_pct: seg.deltaPct,
  };
}

function convertResult(r: SimulationResult, scenarioName: string, narrative: string) {
  return {
    scenario_name: scenarioName,
    agent_count: r.agentCount,
    animated_agent_count: r.animatedAgentCount,
    run_duration_s: r.runDurationS,
    has_proposed_lines: r.hasProposedLines,
    time_range: { start_min: r.timeRange.startMin, end_min: r.timeRange.endMin },
    baseline: {
      pct_accessible: r.baseline.pctAccessible,
      avg_transit_time_min: r.baseline.avgTransitMin,
      median_transit_time_min: r.baseline.medianTransitMin,
      p90_transit_time_min: r.baseline.p90TransitMin,
      avg_total_time_min: r.baseline.avgTotalMin,
      avg_transfers: r.baseline.avgTransfers,
      avg_car_time_min: r.baseline.avgCarMin,
      income_breakdown: r.baseline.incomeBreakdown,
    },
    scenario: {
      pct_accessible: r.scenario.pctAccessible,
      avg_transit_time_min: r.scenario.avgTransitMin,
      median_transit_time_min: r.scenario.medianTransitMin,
      p90_transit_time_min: r.scenario.p90TransitMin,
      avg_total_time_min: r.scenario.avgTotalMin,
      avg_transfers: r.scenario.avgTransfers,
      avg_car_time_min: r.scenario.avgCarMin,
      income_breakdown: r.scenario.incomeBreakdown,
    },
    delta: {
      time_saved_min: r.delta.timeSavedMin,
      total_time_saved_min: r.delta.totalTimeSavedMin,
      accessibility_gain_pct: r.delta.accessibilityGainPct,
      transfer_reduction: r.delta.transferReduction,
      equity_improvement: r.delta.equityImprovement,
      newly_accessible_agents: r.delta.newlyAccessibleAgents,
    },
    equity: {
      baseline_score: r.equity.baselineScore,
      scenario_score: r.equity.scenarioScore,
    },
    line_stress: r.lineStress.map(convertStressSegment),
    baseline_edge_stress: r.baselineEdgeStress.map(convertStressSegment),
    per_agent: r.perAgent.map((p) => ({
      agent_id: p.agentId,
      home_lon: p.homeLon,
      home_lat: p.homeLat,
      income: p.income,
      transit_dep: p.transitDep,
      persona: p.persona,
      purpose: p.purpose,
      baseline_time: p.baselineTime,
      scenario_time: p.scenarioTime,
      time_saved_min: p.timeSavedMin,
      newly_accessible: p.newlyAccessible,
      departure_min: p.departureMin,
      path_coords: p.pathCoords,
    })),
    narrative,
    transit_speed_source:    r.transitSpeedSource,
    transit_updated_at:      r.transitUpdatedAt,
    transit_trip_count:      r.transitTripCount,
    transit_road_multiplier: r.transitRoadMultiplier,
    transit_time_period:     r.transitTimePeriod,
    graph_stats: {
      baseline_nodes: r.graphStats.nodes,
      baseline_edges: r.graphStats.edges,
      scenario_nodes: r.graphStats.scenarioNodes,
      scenario_edges: r.graphStats.scenarioEdges,
    },
  };
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    proposed_lines?: { name: string; type: string; stops: { name: string; coords: [number, number] }[] }[];
    agent_count?: number;
    scenario_name?: string;
    seed?: number;
    narrate?: boolean;
    time_range?: { start_min: number; end_min: number };
    transit_speeds?: TransitSpeedData;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const tr = body.time_range ?? { start_min: 360, end_min: 1440 };
    const result = await runSimulation({
      proposed: body.proposed_lines ?? [],
      agentCount: body.agent_count ?? 500,
      seed: body.seed ?? 42,
      timeRange: { startMin: tr.start_min, endMin: tr.end_min },
      transitSpeeds: body.transit_speeds,
    });

    const narrative =
      (body.narrate ?? false) && result.hasProposedLines
        ? await generateNarrative(result, body.scenario_name ?? "Proposed Scenario")
        : "";

    const payload = convertResult(result, body.scenario_name ?? "Baseline Network", narrative);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[simulation] run error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Simulation failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const result = await runSimulation({ proposed: [], agentCount: 50, seed: 42, timeRange: { startMin: 360, endMin: 1440 } });
    return NextResponse.json({
      graph_loaded: true,
      stop_count: result.graphStats.nodes,
      edge_count: result.graphStats.edges,
    });
  } catch (err) {
    return NextResponse.json({ graph_loaded: false, error: String(err) }, { status: 503 });
  }
}
