import "server-only";

import { getProvider } from "./ai-provider";
import type { ToolDefinition } from "./ai-provider";

// ── Models ─────────────────────────────────────────────────────────────────────

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

// ── Shared blocks injected into planner prompts ───────────────────────────────

const QUOTE_BLOCK = `Also include a \`\`\`quote block with a single punchy sentence (max 15 words) summarising your stance — written in first person, as if speaking aloud:

\`\`\`quote
Your punchy one-liner here.
\`\`\``;


const PLANNING_RULES = `PLANNING RULES (apply to all proposals and critiques):
1. COST: Route length drives cost — every extra kilometre is expensive and adds years to delivery. Prefer compact, direct alignments. Flag any route that seems unnecessarily long.
2. POPULATION: Prioritise high-density corridors and destinations that are currently underserved or where existing stations are overcrowded. Each stop should justify its existence with clear population demand.
3. STATION SPACING: New stops must be at least 800 m from BOTH (a) existing TTC stations and (b) any stops already proposed earlier in this debate — unless the stop is an explicit transfer to that line. Stops too close to either category with no transfer justification must be relocated or cut. Additionally, no two consecutive stops on the same route may be more than 1500 m apart — if a gap would exceed this, add an intermediate stop or adjust the alignment.
4. SUBWAY ONLY: Every route proposed is a subway line. Do not suggest streetcar or bus alternatives.
5. NO SELF-CONNECTIONS: A stop on the proposed route cannot be labelled as a transfer to another stop on the same proposed route. Transfers are only valid when connecting to a different, pre-existing line.
6. MERIT-BASED SELECTION: Evaluate each candidate stop independently on cost, population served, and spacing. Do not retain a stop simply because of where it falls in the sequence — cut it if it fails on merit.`;

// ── System prompts ─────────────────────────────────────────────────────────────

const PLANNER_A_SYSTEM = `You are Alex Chen, Senior Transit Planner, Toronto. Advocate for ridership, equity, and underserved high-density areas.

For each proposed station give: nearest intersection, one-sentence justification (population served, existing station load relieved, or transfer value).

${PLANNING_RULES}

${QUOTE_BLOCK}

Write your analysis, then call the propose_route tool with your recommended route.`;

const PLANNER_B_SYSTEM = `You are Jordan Park, Infrastructure Cost Analyst, TTC. Every dollar and every kilometre must be justified.

Propose the most cost-efficient subway corridor for the given brief — independently, without reference to any other planner's work. Prioritise shorter total route length, direct alignments, and fewer high-ridership stops over broad coverage.

For each station you include, state:
- Nearest intersection
- Cost Risk 1–10 (tunnel distance to next stop — longer = higher)
- Ridership ROI 1–10 (population density served vs. construction cost)

Cut any stop where Cost Risk exceeds Ridership ROI. Flag any stop within 800 m of an existing TTC station unless it is an explicit transfer.

${PLANNING_RULES}

${QUOTE_BLOCK}

Write your analysis, then call the propose_route tool with your recommended route.`;

const NIMBY_SYSTEM = `You are Margaret Thompson, Residents' Association chair. Passionate and protective of existing residents.

Identify the 2–3 most disruptive stations. For each:
- Exact street corner affected
- Who lives there / what's disrupted
- NIMBY Resistance Score 1–10
- One concrete mitigation

Your quote must be emotional and direct — something like "Don't you dare put a construction site outside my window!" or "This will destroy our neighbourhood!"

${PLANNING_RULES}

${QUOTE_BLOCK}

Max 150 words. No route JSON.`;

const PR_SYSTEM = `You are Devon Walsh, TTC Communications Director. Protect the project from bad headlines.

For the top 3 stations rate (0–10 each):
- Displacement risk
- Construction noise (residential area?)
- Gentrification optics
- Environmental justice

Sum = Overall PR Nightmare Score /40. Flag >25 as political liability.
Also flag if the overall route is excessively long (high cost) or if any stop is too close to an existing station without a transfer benefit — both are easy targets for critics.
Recommend the single change with highest PR risk reduction. Max 150 words. No route JSON.

${PLANNING_RULES}

${QUOTE_BLOCK}`;

const REBUTTAL_SYSTEM = `You are Alex Chen and Jordan Park in joint rebuttal.

You each independently proposed a different route. Now synthesise the best of both into a single refined route:
- Stops that appear in both proposals → include unless they violate spacing rules
- Stops unique to Alex's route → keep if ridership/equity justifies the cost
- Stops unique to Jordan's route → keep if cost efficiency is the stronger argument
- For the 1–2 most contested stops: concede or replace with data-backed alternatives

State tradeoffs explicitly. Be decisive.

${PLANNING_RULES}

${QUOTE_BLOCK}

Write your analysis, then call the propose_route tool with your recommended route.`;

const COMMISSION_SYSTEM = `You are the Toronto Transit Commission Planning Committee.

Rule on each contested station:
1. Confirmed / Modified (new coords) / Rejected
2. One-line mitigation commitment per NIMBY/PR concern raised
3. Revised PR Nightmare Score /40

Ensure the final route is a subway, is as compact as possible while serving the target population, and has no stops within 800 m of an existing station unless they are explicit transfers. Then output the binding final route.

${PLANNING_RULES}

${QUOTE_BLOCK}

Write your ruling, then call the propose_route tool with the final binding route.`;

// ── Agent registry ─────────────────────────────────────────────────────────────

interface Agent {
  key: string;
  name: string;
  role: string;
  color: string;
  system: string;
  model: string;
  maxTokens: number;
}

const AGENTS: Agent[] = [
  // maxTokens for route agents raised to 900: tool call JSON (~500 tokens for 10 stops) + reasoning text
  { key: "planner_a",  name: "Alex Chen",          role: "Ridership Planner",      color: "#2563eb", system: PLANNER_A_SYSTEM,  model: SONNET, maxTokens: 900 },
  { key: "planner_b",  name: "Jordan Park",         role: "Infrastructure Analyst", color: "#16a34a", system: PLANNER_B_SYSTEM,  model: SONNET, maxTokens: 900 },
  { key: "nimby",      name: "Margaret Thompson",   role: "Neighbourhood Rep",      color: "#dc2626", system: NIMBY_SYSTEM,      model: HAIKU,  maxTokens: 300 },
  { key: "pr",         name: "Devon Walsh",         role: "PR Director",            color: "#d97706", system: PR_SYSTEM,         model: HAIKU,  maxTokens: 300 },
  { key: "rebuttal",   name: "Alex & Jordan",       role: "Joint Rebuttal",         color: "#7c3aed", system: REBUTTAL_SYSTEM,   model: SONNET, maxTokens: 900 },
  { key: "commission", name: "Planning Commission", role: "Final Decision",         color: "#64748b", system: COMMISSION_SYSTEM, model: SONNET, maxTokens: 2000 },
];

// ── SSE / extraction helpers ───────────────────────────────────────────────────

function sse(payload: Record<string, unknown>): string {
  return "data: " + JSON.stringify(payload) + "\n\n";
}

function extractQuote(text: string): string | null {
  const m = /```quote\s*(.*?)```/s.exec(text);
  return m ? m[1]!.trim() : null;
}

function stopsLabel(route: Record<string, unknown> | null): string {
  if (!route) return "(none)";
  const stops = route.stops as Array<{ name: string; coords: [number, number] }> | undefined;
  if (!stops?.length) return "(none)";
  return stops.map((s) => `${s.name} (${s.coords[0].toFixed(4)}, ${s.coords[1].toFixed(4)})`).join("; ");
}

// ── Tool definition ────────────────────────────────────────────────────────────

// 📖 Learn: JSON Schema describes the *shape* of the tool arguments. Both Anthropic
// and Gemini accept this same format. The model is forced to call this tool, so the
// output is always a valid, parseable object — no regex fallback needed.
const PROPOSE_ROUTE_TOOL: ToolDefinition = {
  name: "propose_route",
  description: "Submit the proposed subway route after your written analysis.",
  inputSchema: {
    type: "object",
    properties: {
      name:  { type: "string", description: "Short route name, e.g. 'Eglinton West Extension'" },
      type:  { type: "string", enum: ["subway"] },
      color: { type: "string", description: "Hex colour code, e.g. #2563eb" },
      stops: {
        type: "array",
        description: "Stops ordered along the corridor — no zigzagging. Each consecutive pair must be 800 m–1500 m apart. Toronto: lon −79.65 to −79.10, lat 43.55 to 43.85.",
        minItems: 6,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            name:   { type: "string", description: "Nearest intersection or landmark" },
            coords: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
              description: "[longitude, latitude]",
            },
          },
          required: ["name", "coords"],
        },
      },
    },
    required: ["name", "type", "color", "stops"],
  },
};

// ── Geometry helpers ───────────────────────────────────────────────────────────

// Reorder stops into corridor sequence by projecting onto the axis connecting the
// two farthest-apart endpoints. Finding the endpoints first avoids greedy
// nearest-neighbour's tendency to snake back along already-visited segments.
// 📖 Learn: the dot product (p - A) · (B - A) gives a scalar measuring how far
// along the A→B direction each stop lies. Sorting by this scalar puts all stops
// in corridor order regardless of their original list order.
function sortRouteStops(route: Record<string, unknown>): Record<string, unknown> {
  const stops = route.stops as Array<{ name: string; coords: [number, number] }> | undefined;
  if (!stops || stops.length <= 2) return route;

  // Step 1: find the two stops that are farthest apart — these are the endpoints.
  let maxD = 0, endA = 0, endB = 1;
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const dx = stops[i]!.coords[0] - stops[j]!.coords[0];
      const dy = stops[i]!.coords[1] - stops[j]!.coords[1];
      const d = dx * dx + dy * dy;
      if (d > maxD) { maxD = d; endA = i; endB = j; }
    }
  }

  // Step 2: sort by projection onto the axis connecting the two endpoints.
  const ax = stops[endA]!.coords[0], ay = stops[endA]!.coords[1];
  const bx = stops[endB]!.coords[0], by = stops[endB]!.coords[1];
  const axisX = bx - ax, axisY = by - ay;

  const sorted = [...stops].sort((a, b) => {
    const pa = (a.coords[0] - ax) * axisX + (a.coords[1] - ay) * axisY;
    const pb = (b.coords[0] - ax) * axisX + (b.coords[1] - ay) * axisY;
    return pa - pb;
  });

  return { ...route, stops: sorted };
}

// ── Agent turns ────────────────────────────────────────────────────────────────

// Text-only turn (NIMBY, PR) — streams text, no route output.
async function* turn(
  agent: Agent,
  threadId: string,
  prompt: string,
  providerName?: string,
): AsyncGenerator<{ chunk: string; full: string }> {
  yield { chunk: sse({ type: "agent_start", agent: agent.name, role: agent.role, color: agent.color }), full: "" };
  let full = "";
  for await (const text of getProvider(providerName).streamMessage(threadId, prompt, agent.model, agent.maxTokens)) {
    full += text;
    yield { chunk: sse({ type: "agent_text", agent: agent.name, text }), full };
  }
  const quote = extractQuote(full);
  if (quote) yield { chunk: sse({ type: "agent_quote", agent: agent.name, text: quote }), full };
  yield { chunk: sse({ type: "agent_end", agent: agent.name }), full };
}

// Route-producing turn (planners, rebuttal, commission) — two-step approach:
// Step 1: stream the written analysis via streamMessage so text is always visible.
// Step 2: force the propose_route tool call via streamMessageWithTool to get the
// validated route JSON. Splitting into two calls guarantees text_delta events fire
// before the tool call, preventing the "waiting" state when tool_choice causes the
// model to skip text and call the tool immediately.
async function* turnWithRoute(
  agent: Agent,
  threadId: string,
  prompt: string,
  providerName?: string,
): AsyncGenerator<{ chunk: string; full: string; route: Record<string, unknown> | null }> {
  yield { chunk: sse({ type: "agent_start", agent: agent.name, role: agent.role, color: agent.color }), full: "", route: null };
  let full = "";
  let route: Record<string, unknown> | null = null;

  // Step 1: stream the analysis text (no tool forcing — guarantees text output)
  for await (const text of getProvider(providerName).streamMessage(
    threadId, prompt, agent.model, agent.maxTokens,
  )) {
    full += text;
    yield { chunk: sse({ type: "agent_text", agent: agent.name, text }), full, route: null };
  }

  // Step 2: force the tool call to extract the structured route JSON.
  // The thread already has the analysis from step 1, so the model has full context.
  for await (const item of getProvider(providerName).streamMessageWithTool(
    threadId,
    "Now call the propose_route tool with your recommended route based on your analysis above.",
    PROPOSE_ROUTE_TOOL, agent.model, agent.maxTokens,
  )) {
    if (item.type === "text") {
      // Model may add brief text in step 2 — append it
      full += item.text;
      yield { chunk: sse({ type: "agent_text", agent: agent.name, text: item.text }), full, route: null };
    } else {
      // type === "tool" — the guaranteed structured route; emitted once at end of stream
      route = sortRouteStops(item.input);
    }
  }

  const quote = extractQuote(full);
  if (quote) yield { chunk: sse({ type: "agent_quote", agent: agent.name, text: quote }), full, route: null };
  yield { chunk: sse({ type: "agent_end", agent: agent.name }), full, route };
}

// ── Data brief (no DB required — agents have Toronto knowledge) ────────────────

function buildDataBrief(neighbourhoods: string[], stationNames: string[]): string {
  const parts: string[] = [];
  if (neighbourhoods.length > 0)
    parts.push(`Target neighbourhoods: ${neighbourhoods.join(", ")}.`);
  if (stationNames.length > 0)
    parts.push(`Stations to connect: ${stationNames.join(", ")}.`);
  return parts.length > 0 ? parts.join("\n") : "No specific location data provided.";
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface ExistingStop {
  name: string;
  coords: [number, number];
  route: string;
}

export interface CouncilInput {
  neighbourhoods: string[];
  stations: string[];
  lineType?: string | null;
  extraContext?: string | null;
  existingLines?: ExistingStop[];
  provider?: string;
}

// ── Council orchestration ──────────────────────────────────────────────────────

export async function* runCouncil(input: CouncilInput): AsyncGenerator<string> {
  const { neighbourhoods, stations, lineType, extraContext, existingLines = [], provider: providerName } = input;

  yield sse({ type: "status", text: "Assembling transit data…" });
  const dataBrief = buildDataBrief(neighbourhoods, stations);

  yield sse({ type: "status", text: "Creating council sessions…" });

  // Create one assistant+thread per agent, in parallel
  let sessions: Record<string, string>;
  try {
    const results = await Promise.all(
      AGENTS.map(async (ag) => {
        const aid = await getProvider(providerName).createAssistant(ag.name, ag.system);
        const tid = await getProvider(providerName).createThread(aid);
        return [ag.key, tid] as const;
      }),
    );
    sessions = Object.fromEntries(results);
  } catch (err) {
    yield sse({ type: "status", text: `Council setup failed: ${String(err)}` });
    yield sse({ type: "done" });
    return;
  }

  yield sse({ type: "status", text: "Council ready — deliberation begins." });

  // Shared brief
  const typeStr = lineType ? `Mode preference: ${lineType}. ` : "";
  let brief =
    `# Planning Brief\n` +
    `Serve: ${neighbourhoods.join(", ") || "Toronto"}. ` +
    `Connect: ${stations.join(", ") || "None specified"}. ` +
    `${typeStr}\n\n` +
    `## Stop demand data\n${dataBrief}`;

  if (existingLines.length > 0) {
    const byRoute: Record<string, string[]> = {};
    for (const s of existingLines) {
      (byRoute[s.route] ??= []).push(`${s.name} (${s.coords[0].toFixed(4)}, ${s.coords[1].toFixed(4)})`);
    }
    const linesText = Object.entries(byRoute)
      .map(([route, stops]) => `  ${route}: ${stops.join(", ")}`)
      .join("\n");
    brief +=
      `\n\n## Existing TTC lines & stops\n${linesText}\n` +
      `TRANSFER RULE: wherever your proposed route crosses or comes within 150 m of an existing stop, ` +
      `place a stop at that exact location named '<ExistingStation> Transfer'.`;
  }

  if (extraContext) brief += `\n\nExtra context: ${extraContext}`;

  const ag = (key: string) => AGENTS.find((a) => a.key === key)!;

  try {
    // ── R1: Planner A initial proposal ────────────────────────────────────────
    let fullA = "", routeA: Record<string, unknown> | null = null;
    for await (const { chunk, full, route } of turnWithRoute(
      ag("planner_a"), sessions["planner_a"]!,
      brief + "\n\nPropose 6–20 stations. For each, justify on merit: population density served, " +
      "distance from nearest existing station, and cost contribution to total route length. " +
      "Do not retain a stop because of where it falls in sequence — every stop must earn its place.",
      providerName,
    )) { yield chunk; fullA = full; if (route) routeA = route; }
    if (routeA) yield sse({ type: "route_update", route: routeA, round: 1 });

    // ── R2: Planner B independent proposal ────────────────────────────────────
    let fullB = "", routeB: Record<string, unknown> | null = null;
    for await (const { chunk, full, route } of turnWithRoute(
      ag("planner_b"), sessions["planner_b"]!,
      brief + "\n\nPropose 6–20 stations for the most cost-efficient corridor. " +
      "For each stop, state the nearest intersection, Cost Risk 1–10, and Ridership ROI 1–10. " +
      "Cut any stop where Cost Risk exceeds Ridership ROI. Prefer direct alignments and fewer, higher-ridership stops. " +
      "Do not retain a stop because of where it falls in sequence — every stop must earn its place.",
      providerName,
    )) { yield chunk; fullB = full; if (route) routeB = route; }
    if (routeB) yield sse({ type: "route_update", route: routeB, round: 2 });
    const current = routeB ?? routeA;

    // ── R3: NIMBY ─────────────────────────────────────────────────────────────
    let fullN = "";
    for await (const { chunk, full } of turn(
      ag("nimby"), sessions["nimby"]!,
      `Alex's proposal:\n${routeA ? JSON.stringify(routeA, null, 2) : "(none)"}\n\n` +
      `Jordan's proposal:\n${routeB ? JSON.stringify(routeB, null, 2) : "(none)"}\n\n` +
      `Affected areas: ${neighbourhoods.join(", ") || "Toronto"}.\n\n` +
      "Identify 2–3 most disruptive stations across both proposals on merit. NIMBY scores + mitigations.",
      providerName,
    )) { yield chunk; fullN = full; }

    // ── R4: PR assessment ──────────────────────────────────────────────────────
    let fullPr = "";
    for await (const { chunk, full } of turn(
      ag("pr"), sessions["pr"]!,
      `Full debate:\n**Alex:** ${fullA.slice(0, 400)}…\n**Jordan:** ${fullB.slice(0, 400)}…\n**Margaret:** ${fullN}\n\n` +
      "Score top 3 stations on Displacement/Noise/Gentrification/EnvJustice. Overall PR score /40. " +
      "Also flag any stop that appears redundant with an existing or already-proposed station (<800 m, no transfer value). " +
      "One highest-impact recommendation.",
      providerName,
    )) { yield chunk; fullPr = full; }

    // ── R5: Joint rebuttal ────────────────────────────────────────────────────
    // Combine stops from both independent proposals for the 800 m exclusion zone.
    const allProposed = [stopsLabel(routeA), stopsLabel(routeB)].filter(s => s !== "(none)").join("; ") || "(none)";
    let fullReb = "", routeReb: Record<string, unknown> | null = null;
    for await (const { chunk, full, route } of turnWithRoute(
      ag("rebuttal"), sessions["rebuttal"]!,
      brief + `\n\n**Alex:** ${fullA}\n**Jordan:** ${fullB}\n**Margaret:** ${fullN}\n**Devon:** ${fullPr}\n\n` +
      `## All stops proposed so far (occupied locations — 800 m exclusion zone for replacements):\n${allProposed}\n\n` +
      "Issue joint rebuttal. Defend or replace the 1–2 most contested stations on merit. " +
      "Any replacement stop must be >800 m from all existing TTC stations AND all already-proposed stops above. " +
      "No stop may be a transfer to another stop on this same proposed line.",
      providerName,
    )) { yield chunk; fullReb = full; if (route) routeReb = route; }
    if (routeReb) yield sse({ type: "route_update", route: routeReb, round: 5 });

    // ── R6: Commission final ───────────────────────────────────────────────────
    const finalOccupied = stopsLabel(routeReb ?? current);
    let fullCom = "", routeCom: Record<string, unknown> | null = null;
    for await (const { chunk, full, route } of turnWithRoute(
      ag("commission"), sessions["commission"]!,
      brief + `\n\n**Alex:** ${fullA}\n**Jordan:** ${fullB}\n**Margaret:** ${fullN}\n` +
      `**Devon:** ${fullPr}\n**Rebuttal:** ${fullReb}\n\n` +
      `## All stops proposed across all rounds (occupied — 800 m exclusion zone):\n${finalOccupied}\n\n` +
      "Rule on each contested station on merit. Commit to mitigations. Revised PR score. " +
      "Any modified stop must be >800 m from existing TTC stations AND all other proposed stops listed above. " +
      "No stop may be a transfer to another stop on this same line.",
      providerName,
    )) { yield chunk; fullCom = full; if (route) routeCom = route; }

    const routeFinal = routeCom ?? routeReb ?? current;
    if (routeFinal) {
      let prScore: number | undefined;
      for (const src of [fullCom, fullPr]) {
        const m = /(?:PR Nightmare Score|score)[^\d]*(\d+)\s*\/\s*40/i.exec(src);
        if (m) { prScore = parseInt(m[1]!, 10); break; }
      }
      const payload: Record<string, unknown> = { type: "route_final", route: routeFinal };
      if (prScore !== undefined) payload.pr_score = prScore;
      yield sse(payload);
    }
  } catch (err) {
    yield sse({ type: "status", text: `Council error: ${String(err)}` });
  }

  yield sse({ type: "done" });
}
