import "server-only";

import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";

import { getProvider, type ToolDefinition } from "./ai-provider";
import { scoreRoute, type CouncilInput, type ExistingStop, type OrchestratorDirective, type RouteScore } from "./council";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const MAX_REVISIONS = 2;
const MAX_EXISTING_STOPS_IN_BRIEF = 90;

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

Max 150 words. After your critique, call cast_votes for the stops you object to.`;

const PR_SYSTEM = `You are Devon Walsh, TTC Communications Director. Protect the project from bad headlines.

For the top 3 stations rate (0–10 each):
- Displacement risk
- Construction noise (residential area?)
- Gentrification optics
- Environmental justice

Sum = Overall PR Nightmare Score /40. Flag >25 as political liability.
Also flag if the overall route is excessively long (high cost) or if any stop is too close to an existing station without a transfer benefit — both are easy targets for critics.
Recommend the single change with highest PR risk reduction. Max 150 words.

${PLANNING_RULES}

${QUOTE_BLOCK}

After your assessment, call cast_votes for the stops that create political or communications risk.`;

const REBUTTAL_SYSTEM = `You are Alex Chen and Jordan Park in joint rebuttal.

Synthesize the best of both initial proposals into a single refined route. When stops are contested, either defend them with evidence or replace them decisively.

${PLANNING_RULES}

${QUOTE_BLOCK}

Write your analysis, then call the propose_route tool with your recommended route.`;

const COMMISSION_SYSTEM = `You are the Toronto Transit Commission Planning Committee.

Rule on contested stations and decide whether the current route is ready to approve. If it is not ready, reject it and state the minimum changes required.

${PLANNING_RULES}

${QUOTE_BLOCK}`;

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
  { key: "planner_a", name: "Alex Chen", role: "Ridership Planner", color: "#2563eb", system: PLANNER_A_SYSTEM, model: SONNET, maxTokens: 900 },
  { key: "planner_b", name: "Jordan Park", role: "Infrastructure Analyst", color: "#16a34a", system: PLANNER_B_SYSTEM, model: SONNET, maxTokens: 900 },
  { key: "nimby", name: "Margaret Thompson", role: "Neighbourhood Rep", color: "#dc2626", system: NIMBY_SYSTEM, model: HAIKU, maxTokens: 300 },
  { key: "pr", name: "Devon Walsh", role: "PR Director", color: "#d97706", system: PR_SYSTEM, model: HAIKU, maxTokens: 300 },
  { key: "rebuttal", name: "Alex & Jordan", role: "Joint Rebuttal", color: "#7c3aed", system: REBUTTAL_SYSTEM, model: SONNET, maxTokens: 900 },
  { key: "commission", name: "Planning Commission", role: "Final Decision", color: "#64748b", system: COMMISSION_SYSTEM, model: SONNET, maxTokens: 2000 },
];

interface RouteStop {
  name: string;
  coords: [number, number];
}

interface RouteResult {
  name: string;
  type: "subway";
  color: string;
  stops: RouteStop[];
}

interface VoteItem {
  stop: string;
  object: boolean;
  severity: number;
  reason: string;
}

interface Ballot {
  objections: VoteItem[];
  summary?: string;
}

interface Ruling {
  decision: "approve" | "reject";
  pr_score?: number;
  rationale: string;
}

type Sessions = Record<string, string>;

type CouncilEvent = Record<string, unknown>;

function estimateRouteScore(route: RouteResult | null, existingLines: ExistingStop[]): RouteScore | null {
  if (!route) return null;
  return scoreRoute(route as unknown as Record<string, unknown>, existingLines);
}

function emitScoreUpdate(
  config: LangGraphRunnableConfig,
  agentName: "Alex Chen" | "Jordan Park",
  score: RouteScore | null,
): void {
  if (!score) return;
  emit(config, { type: "score_update", agent: agentName, score });
}

function buildOrchestratorDirective(state: CouncilState): OrchestratorDirective {
  const baseAgents: OrchestratorDirective["activeAgents"] = ["nimby", "pr"];
  if ((state.routeA?.stops.length ?? 0) > 10 || (state.routeB?.stops.length ?? 0) > 10) baseAgents.push("cost");
  if (state.neighbourhoods.length >= 2) baseAgents.push("equity");

  // # 📖 Learn: backward-compatible SSE lets us evolve backend flow without forcing an all-at-once UI migration.
  return {
    activeAgents: baseAgents,
    focusPoints: [
      "cost",
      "station spacing",
      "political risk",
    ],
    terminateEarly: false,
    reasoning: "Graph compatibility mode: run critics, then decide if rebuttal is required from joint objections.",
  };
}

function defaulted<T>(getDefault: () => T) {
  return Annotation<T>({
    reducer: (_current, update) => update,
    default: getDefault,
  });
}

const State = Annotation.Root({
  neighbourhoods: defaulted<string[]>(() => []),
  stations: defaulted<string[]>(() => []),
  lineType: defaulted<string | null>(() => null),
  extraContext: defaulted<string | null>(() => null),
  existingLines: defaulted<ExistingStop[]>(() => []),
  providerName: defaulted<string | undefined>(() => undefined),
  randomizeSpeakingOrder: defaulted<boolean>(() => true),
  brief: defaulted<string>(() => ""),
  sessions: defaulted<Sessions>(() => ({})),
  fullA: defaulted<string>(() => ""),
  fullB: defaulted<string>(() => ""),
  fullNimby: defaulted<string>(() => ""),
  fullPr: defaulted<string>(() => ""),
  fullRebuttal: defaulted<string>(() => ""),
  fullCommission: defaulted<string>(() => ""),
  routeA: defaulted<RouteResult | null>(() => null),
  routeB: defaulted<RouteResult | null>(() => null),
  rebuttalRoute: defaulted<RouteResult | null>(() => null),
  finalRoute: defaulted<RouteResult | null>(() => null),
  nimbyVotes: defaulted<Ballot | null>(() => null),
  prVotes: defaulted<Ballot | null>(() => null),
  contestedStops: defaulted<string[]>(() => []),
  nextPlanner: defaulted<"plannerA" | "plannerB" | null>(() => null),
  nextCritic: defaulted<"nimby" | "pr" | null>(() => null),
  revisionCount: defaulted<number>(() => 0),
  commissionDecision: defaulted<"approve" | "reject" | null>(() => null),
  prScore: defaulted<number | undefined>(() => undefined),
  // Prior-round context preserved across revisions so planners can revise
  // independently with knowledge of what critics objected to last time.
  priorNimby: defaulted<string>(() => ""),
  priorPr: defaulted<string>(() => ""),
  priorContested: defaulted<string[]>(() => []),
  priorRouteA: defaulted<RouteResult | null>(() => null),
  priorRouteB: defaulted<RouteResult | null>(() => null),
});

type CouncilState = typeof State.State;

const PROPOSE_ROUTE_TOOL: ToolDefinition = {
  name: "propose_route",
  description: "Submit the proposed subway route after your written analysis.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short route name, e.g. 'Eglinton West Extension'" },
      type: { type: "string", enum: ["subway"] },
      color: { type: "string", description: "Hex colour code, e.g. #2563eb" },
      stops: {
        type: "array",
        description: "Stops ordered along the corridor — no zigzagging. Toronto: lon −79.65 to −79.10, lat 43.55 to 43.85.",
        minItems: 6,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nearest intersection or landmark" },
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

const CAST_VOTES_TOOL: ToolDefinition = {
  name: "cast_votes",
  description: "Cast structured objections for proposed stops.",
  inputSchema: {
    type: "object",
    properties: {
      objections: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            stop: { type: "string", description: "Exact stop name from the candidate list." },
            object: { type: "boolean", description: "True if you object to this stop." },
            severity: { type: "number", minimum: 0, maximum: 10 },
            reason: { type: "string" },
          },
          required: ["stop", "object", "severity", "reason"],
        },
      },
      summary: { type: "string" },
    },
    required: ["objections"],
  },
};

const COMMISSION_RULING_TOOL: ToolDefinition = {
  name: "commission_ruling",
  description: "Approve or reject the current route and provide a concise rationale.",
  inputSchema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["approve", "reject"] },
      pr_score: { type: "number", minimum: 0, maximum: 40 },
      rationale: { type: "string" },
    },
    required: ["decision", "rationale"],
  },
};

function sse(payload: Record<string, unknown>): string {
  return "data: " + JSON.stringify(payload) + "\n\n";
}

function emit(config: LangGraphRunnableConfig, payload: CouncilEvent): void {
  config.writer?.(payload);
}

function agent(key: string): Agent {
  return AGENTS.find((a) => a.key === key)!;
}

function extractQuote(text: string): string | null {
  const m = /```quote\s*(.*?)```/s.exec(text);
  return m ? m[1]!.trim() : null;
}

function normalizeStopName(stop: string): string {
  return stop.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function routeStops(route: RouteResult | null): string[] {
  return route?.stops.map((s) => s.name) ?? [];
}

function clip(text: string, max = 700): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function routeSummary(route: RouteResult | null): string {
  if (!route) return "(none)";
  return `${route.name}: ${route.stops.map((s) => s.name).join(" -> ")}`;
}

function debateSummary(state: CouncilState): string {
  return [
    `Alex route: ${routeSummary(state.routeA)}`,
    `Jordan route: ${routeSummary(state.routeB)}`,
    state.rebuttalRoute ? `Current rebuttal route: ${routeSummary(state.rebuttalRoute)}` : "",
    state.fullNimby ? `Margaret: ${clip(state.fullNimby, 350)}` : "",
    state.fullPr ? `Devon: ${clip(state.fullPr, 350)}` : "",
    state.fullRebuttal ? `Rebuttal: ${clip(state.fullRebuttal, 450)}` : "",
  ].filter(Boolean).join("\n");
}

function allCandidateStops(state: CouncilState): string[] {
  const names = [
    ...routeStops(state.routeA),
    ...routeStops(state.routeB),
    ...routeStops(state.rebuttalRoute),
  ];
  return Array.from(new Set(names));
}

function buildDataBrief(neighbourhoods: string[], stationNames: string[]): string {
  const parts: string[] = [];
  if (neighbourhoods.length > 0) parts.push(`Target neighbourhoods: ${neighbourhoods.join(", ")}.`);
  if (stationNames.length > 0) parts.push(`Stations to connect: ${stationNames.join(", ")}.`);
  return parts.length > 0 ? parts.join("\n") : "No specific location data provided.";
}

function buildBrief(input: Pick<CouncilState, "neighbourhoods" | "stations" | "lineType" | "extraContext" | "existingLines">): string {
  const typeStr = input.lineType ? `Mode preference: ${input.lineType}. ` : "";
  let brief =
    `# Planning Brief\n` +
    `Serve: ${input.neighbourhoods.join(", ") || "Toronto"}. ` +
    `Connect: ${input.stations.join(", ") || "None specified"}. ` +
    `${typeStr}\n\n` +
    `## Stop demand data\n${buildDataBrief(input.neighbourhoods, input.stations)}`;

  if (input.existingLines.length > 0) {
    const byRoute: Record<string, string[]> = {};
    for (const s of input.existingLines.slice(0, MAX_EXISTING_STOPS_IN_BRIEF)) {
      (byRoute[s.route] ??= []).push(`${s.name} (${s.coords[0].toFixed(4)}, ${s.coords[1].toFixed(4)})`);
    }
    const linesText = Object.entries(byRoute)
      .map(([route, stops]) => `  ${route}: ${stops.join(", ")}`)
      .join("\n");
    const omitted = input.existingLines.length - MAX_EXISTING_STOPS_IN_BRIEF;
    brief +=
      `\n\n## Existing TTC lines & stops\n${linesText}\n` +
      (omitted > 0 ? `(${omitted} additional existing stops omitted from this token-limited planning brief.)\n` : "") +
      `TRANSFER RULE: wherever your proposed route crosses or comes within 150 m of an existing stop, ` +
      `place a stop at that exact location named '<ExistingStation> Transfer'.`;
  }

  if (input.extraContext) brief += `\n\nExtra context: ${input.extraContext}`;
  return brief;
}

function sortRouteStops(route: Record<string, unknown>): RouteResult {
  const stops = route.stops as RouteStop[] | undefined;
  if (!stops || stops.length <= 2) return route as unknown as RouteResult;

  let maxD = 0;
  let endA = 0;
  let endB = 1;
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const dx = stops[i]!.coords[0] - stops[j]!.coords[0];
      const dy = stops[i]!.coords[1] - stops[j]!.coords[1];
      const d = dx * dx + dy * dy;
      if (d > maxD) {
        maxD = d;
        endA = i;
        endB = j;
      }
    }
  }

  const ax = stops[endA]!.coords[0];
  const ay = stops[endA]!.coords[1];
  const bx = stops[endB]!.coords[0];
  const by = stops[endB]!.coords[1];
  const axisX = bx - ax;
  const axisY = by - ay;

  const sorted = [...stops].sort((a, b) => {
    const pa = (a.coords[0] - ax) * axisX + (a.coords[1] - ay) * axisY;
    const pb = (b.coords[0] - ax) * axisX + (b.coords[1] - ay) * axisY;
    return pa - pb;
  });

  return { ...(route as unknown as RouteResult), stops: sorted };
}

async function streamTextTurn(
  config: LangGraphRunnableConfig,
  state: CouncilState,
  ag: Agent,
  prompt: string,
): Promise<string> {
  emit(config, { type: "agent_start", agent: ag.name, role: ag.role, color: ag.color });
  let full = "";
  for await (const text of getProvider(state.providerName).streamMessage(
    state.sessions[ag.key]!,
    prompt,
    ag.model,
    ag.maxTokens,
  )) {
    full += text;
    emit(config, { type: "agent_text", agent: ag.name, text });
  }
  const quote = extractQuote(full);
  if (quote) emit(config, { type: "agent_quote", agent: ag.name, text: quote });
  return full;
}

async function streamRouteTurn(
  config: LangGraphRunnableConfig,
  state: CouncilState,
  ag: Agent,
  prompt: string,
): Promise<{ full: string; route: RouteResult | null }> {
  const full = await streamTextTurn(config, state, ag, prompt);
  let route: RouteResult | null = null;
  for await (const item of getProvider(state.providerName).streamMessageWithTool(
    state.sessions[ag.key]!,
    "Now call the propose_route tool with your recommended route based on your analysis above.",
    PROPOSE_ROUTE_TOOL,
    ag.model,
    ag.maxTokens,
  )) {
    if (item.type === "text") {
      emit(config, { type: "agent_text", agent: ag.name, text: item.text });
    } else {
      route = sortRouteStops(item.input);
    }
  }
  emit(config, { type: "agent_end", agent: ag.name });
  return { full, route };
}

async function streamVoteTurn(
  config: LangGraphRunnableConfig,
  state: CouncilState,
  ag: Agent,
  prompt: string,
): Promise<{ full: string; ballot: Ballot | null }> {
  const full = await streamTextTurn(config, state, ag, prompt);
  let ballot: Ballot | null = null;
  const candidates = allCandidateStops(state).join(", ") || "(no candidate stops)";
  for await (const item of getProvider(state.providerName).streamMessageWithTool(
    state.sessions[ag.key]!,
    `Now call cast_votes. Only use exact stop names from this candidate list: ${candidates}`,
    CAST_VOTES_TOOL,
    ag.model,
    ag.maxTokens,
  )) {
    if (item.type === "text") {
      emit(config, { type: "agent_text", agent: ag.name, text: item.text });
    } else {
      ballot = item.input as unknown as Ballot;
    }
  }
  emit(config, { type: "agent_end", agent: ag.name });
  return { full, ballot };
}

async function setupNode(state: CouncilState, config: LangGraphRunnableConfig) {
  emit(config, { type: "status", text: "Assembling transit data…" });
  const brief = buildBrief(state);
  emit(config, { type: "status", text: "Creating LangGraph council sessions…" });

  const results = await Promise.all(
    AGENTS.map(async (ag) => {
      const assistantId = await getProvider(state.providerName).createAssistant(ag.name, ag.system);
      const threadId = await getProvider(state.providerName).createThread(assistantId);
      return [ag.key, threadId] as const;
    }),
  );

  emit(config, { type: "status", text: "Council ready — graph deliberation begins." });
  return { brief, sessions: Object.fromEntries(results) as Sessions };
}

// When revisionCount > 0, surface the prior round's critic objections and the
// planner's own last route so they revise from feedback instead of restarting.
function revisionContext(state: CouncilState, ownPrior: RouteResult | null): string {
  if (state.revisionCount === 0) return "";
  return (
    `\n\n## Revision round ${state.revisionCount}\n` +
    `Your prior route: ${routeSummary(ownPrior)}\n` +
    `Stops both critics objected to last round: ${state.priorContested.join(", ") || "(none)"}\n` +
    (state.priorNimby ? `Margaret's objections:\n${clip(state.priorNimby, 350)}\n` : "") +
    (state.priorPr ? `Devon's objections:\n${clip(state.priorPr, 350)}\n` : "") +
    `Address these specifically: defend, cut, or replace. Do not resubmit the same route.`
  );
}

async function plannerANode(state: CouncilState, config: LangGraphRunnableConfig) {
  const { full, route } = await streamRouteTurn(
    config,
    state,
    agent("planner_a"),
    state.brief +
      "\n\nPropose 6–20 stations. For each, justify on merit: population density served, distance from nearest existing station, and cost contribution to total route length." +
      revisionContext(state, state.priorRouteA),
  );
  if (route) emit(config, { type: "route_update", route, round: 1 });
  emitScoreUpdate(config, "Alex Chen", estimateRouteScore(route, state.existingLines));
  return { fullA: full, routeA: route };
}

async function plannerBNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const { full, route } = await streamRouteTurn(
    config,
    state,
    agent("planner_b"),
    state.brief +
      "\n\nPropose 6–20 stations for the most cost-efficient corridor. Cut any stop where Cost Risk exceeds Ridership ROI. Prefer direct alignments and fewer, higher-ridership stops." +
      revisionContext(state, state.priorRouteB),
  );
  if (route) emit(config, { type: "route_update", route, round: 2 });
  emitScoreUpdate(config, "Jordan Park", estimateRouteScore(route, state.existingLines));
  return { fullB: full, routeB: route };
}

// Stash the prior round into prior* fields and clear per-round state, then send
// the graph back through plannerRouter for fresh independent proposals.
function reviseNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const next = state.revisionCount + 1;
  emit(config, {
    type: "status",
    text: `Revision ${next}: planners re-propose independently with critic feedback.`,
  });
  return {
    revisionCount: next,
    priorNimby: state.fullNimby,
    priorPr: state.fullPr,
    priorContested: state.contestedStops,
    priorRouteA: state.routeA,
    priorRouteB: state.routeB,
    routeA: null,
    routeB: null,
    nimbyVotes: null,
    prVotes: null,
    fullNimby: "",
    fullPr: "",
    contestedStops: [],
    nextPlanner: null,
    nextCritic: null,
    commissionDecision: null,
  };
}

function plannerRouterNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const nextPlanner: "plannerA" | "plannerB" = state.randomizeSpeakingOrder
    ? (Math.random() < 0.5 ? "plannerA" : "plannerB")
    : "plannerA";
  const first = nextPlanner === "plannerA" ? "Alex" : "Jordan";
  emit(config, {
    type: "status",
    text: `Moderator opens planning with ${first}.`,
  });
  return { nextPlanner };
}

function criticRouterNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const nextCritic: "nimby" | "pr" = state.randomizeSpeakingOrder
    ? (Math.random() < 0.5 ? "nimby" : "pr")
    : "nimby";
  const first = nextCritic === "nimby" ? "Margaret" : "Devon";
  const directive = buildOrchestratorDirective(state);
  emit(config, { type: "orchestrator", directive });
  emit(config, {
    type: "iteration",
    round: state.revisionCount,
    converged: false,
    reason: "Critic ballot round in progress.",
  });
  emit(config, {
    type: "status",
    text: `Moderator opens ballot round ${state.revisionCount + 1} with ${first}.`,
  });
  return { nextCritic };
}

async function nimbyNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const currentRoute = state.rebuttalRoute ?? state.routeB ?? state.routeA;
  const { full, ballot } = await streamVoteTurn(
    config,
    state,
    agent("nimby"),
    `Current route: ${routeSummary(currentRoute)}\n\n` +
      `Debate summary:\n${debateSummary(state)}\n\n` +
      (state.fullPr ? `Devon's PR assessment this round:\n${clip(state.fullPr, 350)}\n\n` : "") +
      `Affected areas: ${state.neighbourhoods.join(", ") || "Toronto"}.\n\n` +
      "Identify the 2–3 most disruptive stations on merit, then vote only against stops that truly require redesign.",
  );
  return { fullNimby: full, nimbyVotes: ballot };
}

async function prNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const currentRoute = state.rebuttalRoute ?? state.routeB ?? state.routeA;
  const { full, ballot } = await streamVoteTurn(
    config,
    state,
    agent("pr"),
    `Current route: ${routeSummary(currentRoute)}\n\n` +
      `Debate summary:\n${debateSummary(state)}\n` +
      (state.fullNimby ? `Margaret this round: ${clip(state.fullNimby, 350)}\n\n` : "Margaret has not spoken this ballot round yet.\n\n") +
      "Score top stations on Displacement/Noise/Gentrification/EnvJustice. Vote against the stops that are genuine political liabilities.",
  );
  return { fullPr: full, prVotes: ballot };
}

function tallyNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const nimby = new Set(
    (state.nimbyVotes?.objections ?? [])
      .filter((v) => v.object)
      .map((v) => normalizeStopName(v.stop)),
  );
  const pr = new Set(
    (state.prVotes?.objections ?? [])
      .filter((v) => v.object)
      .map((v) => normalizeStopName(v.stop)),
  );

  const contested = allCandidateStops(state).filter((stop) => {
    const normalized = normalizeStopName(stop);
    return nimby.has(normalized) && pr.has(normalized);
  });

  emit(config, {
    type: "status",
    text: contested.length > 0
      ? `Ballot complete: ${contested.length} stop${contested.length === 1 ? "" : "s"} contested by both Margaret and Devon.`
      : "Ballot complete: no stops crossed the joint objection threshold.",
  });

  return { contestedStops: contested };
}

async function commissionNode(state: CouncilState, config: LangGraphRunnableConfig) {
  const ag = agent("commission");
  const currentRoute = state.rebuttalRoute ?? state.routeB ?? state.routeA;
  const full = await streamTextTurn(
    config,
    state,
    ag,
    state.brief +
      `\n\n## Debate summary\n${debateSummary(state)}\n\n` +
      `## Current route\n${routeSummary(currentRoute)}\n\n` +
      `## Remaining contested stops\n${state.contestedStops.join(", ") || "(none)"}\n\n` +
      `Approve the current route only if it is usable and defensible. Reject it if another rebuttal round is required.`,
  );

  let ruling: Ruling = { decision: "approve", rationale: "Approved." };
  for await (const item of getProvider(state.providerName).streamMessageWithTool(
    state.sessions[ag.key]!,
    "Now call commission_ruling with approve or reject.",
    COMMISSION_RULING_TOOL,
    ag.model,
    ag.maxTokens,
  )) {
    if (item.type === "text") {
      emit(config, { type: "agent_text", agent: ag.name, text: item.text });
    } else {
      ruling = item.input as unknown as Ruling;
    }
  }

  let finalRoute: RouteResult | null = null;
  const mustFinalize = ruling.decision === "approve" || state.revisionCount >= MAX_REVISIONS;
  if (mustFinalize) {
    for await (const item of getProvider(state.providerName).streamMessageWithTool(
      state.sessions[ag.key]!,
      "Now call propose_route with the binding final subway route.",
      PROPOSE_ROUTE_TOOL,
      ag.model,
      ag.maxTokens,
    )) {
      if (item.type === "text") {
        emit(config, { type: "agent_text", agent: ag.name, text: item.text });
      } else {
        finalRoute = sortRouteStops(item.input);
      }
    }
  }

  const quote = extractQuote(full);
  if (quote) emit(config, { type: "agent_quote", agent: ag.name, text: quote });
  emit(config, { type: "agent_end", agent: ag.name });

  if (finalRoute) {
    emit(config, { type: "route_final", route: finalRoute, pr_score: ruling.pr_score });
  }
  emit(config, {
    type: "iteration",
    round: state.revisionCount,
    converged: ruling.decision === "approve" || state.revisionCount >= MAX_REVISIONS,
    reason: ruling.decision === "approve"
      ? "Commission approved the route."
      : state.revisionCount >= MAX_REVISIONS
        ? "Reached max revisions; finalizing current best route."
        : "Commission requested another rebuttal round.",
  });

  return {
    fullCommission: full,
    commissionDecision: ruling.decision,
    prScore: ruling.pr_score,
    finalRoute,
  };
}

function afterTally(state: CouncilState): "revise" | "commission" {
  // If critics jointly contested ≥2 stops and we still have revisions left,
  // send the graph back to the planners for an independent re-proposal.
  return state.contestedStops.length >= 2 && state.revisionCount < MAX_REVISIONS ? "revise" : "commission";
}

function afterPlannerRouter(state: CouncilState): "plannerA" | "plannerB" {
  return state.nextPlanner ?? "plannerA";
}

function afterPlannerA(state: CouncilState): "plannerB" | "criticRouter" {
  return state.routeB ? "criticRouter" : "plannerB";
}

function afterPlannerB(state: CouncilState): "plannerA" | "criticRouter" {
  return state.routeA ? "criticRouter" : "plannerA";
}

function afterCriticRouter(state: CouncilState): "nimby" | "pr" {
  return state.nextCritic ?? "nimby";
}

function afterNimby(state: CouncilState): "pr" | "tally" {
  return state.prVotes ? "tally" : "pr";
}

function afterPr(state: CouncilState): "nimby" | "tally" {
  return state.nimbyVotes ? "tally" : "nimby";
}

function afterCommission(state: CouncilState): "revise" | typeof END {
  // Commission rejection now loops back through revise → plannerRouter so Alex
  // and Jordan each propose a fresh revision independently.
  return state.commissionDecision === "reject" && state.revisionCount < MAX_REVISIONS ? "revise" : END;
}

const graph = new StateGraph(State)
  .addNode("setup", setupNode)
  .addNode("plannerRouter", plannerRouterNode)
  .addNode("plannerA", plannerANode)
  .addNode("plannerB", plannerBNode)
  .addNode("criticRouter", criticRouterNode)
  .addNode("nimby", nimbyNode)
  .addNode("pr", prNode)
  .addNode("tally", tallyNode)
  .addNode("revise", reviseNode)
  .addNode("commission", commissionNode)
  .addEdge(START, "setup")
  .addEdge("setup", "plannerRouter")
  .addConditionalEdges("plannerRouter", afterPlannerRouter, ["plannerA", "plannerB"])
  .addConditionalEdges("plannerA", afterPlannerA, ["plannerB", "criticRouter"])
  .addConditionalEdges("plannerB", afterPlannerB, ["plannerA", "criticRouter"])
  .addConditionalEdges("criticRouter", afterCriticRouter, ["nimby", "pr"])
  .addConditionalEdges("nimby", afterNimby, ["pr", "tally"])
  .addConditionalEdges("pr", afterPr, ["nimby", "tally"])
  .addConditionalEdges("tally", afterTally, ["revise", "commission"])
  .addEdge("revise", "plannerRouter")
  .addConditionalEdges("commission", afterCommission, ["revise", END])
  .compile();

export async function* runCouncilGraph(input: CouncilInput): AsyncGenerator<string> {
  try {
    for await (const event of await graph.stream(
      {
        neighbourhoods: input.neighbourhoods,
        stations: input.stations,
        lineType: input.lineType ?? null,
        extraContext: input.extraContext ?? null,
        existingLines: input.existingLines ?? [],
        providerName: input.provider,
        randomizeSpeakingOrder: input.randomizeSpeakingOrder ?? true,
      },
      {
        streamMode: "custom",
        recursionLimit: 20,
      },
    )) {
      yield sse(event as Record<string, unknown>);
    }
  } catch (err) {
    yield sse({ type: "status", text: `Council graph error: ${String(err)}` });
  }

  yield sse({ type: "done" });
}
