# Transit Council — System Architecture

How the multi-agent transit council works after the five root-cause fixes.

- **Live entry point:** `runCouncilGraph` in [web/src/server/council-graph.ts](web/src/server/council-graph.ts)
  (a LangGraph `StateGraph`), called from [web/src/app/api/council/route.ts](web/src/app/api/council/route.ts).
- The older `runCouncil` in `web/src/server/council.ts` is **not** on the live path —
  only its shared helpers/types (`scoreRoute`, `toSimSummary`, `routeToProposedLine`, …) are reused.

## Flow diagram

```
                                  ┌─────────────────────────────────────────────┐
   POST /api/council  ──────────► │  runCouncilGraph  (LangGraph StateGraph)      │
   {neighbourhoods, stations,     └─────────────────────────────────────────────┘
    existingLines, provider}                        │
                                                     ▼
                                                ┌─────────┐
                                                │  setup  │  build brief, create 1 thread/agent
                                                └─────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │  plannerRouter  │  pick who speaks first
                                            └─────────────────┘
                                                     │
                          ┌──────────────────────────┴──────────────────────────┐
                          ▼                                                       ▼
                  ┌───────────────┐                                      ┌───────────────┐
                  │  plannerA     │ ◄──── (other planner not done yet) ──►│  plannerB     │
                  │  Alex (Sonnet)│                                      │ Jordan (Sonnet)│
                  └───────────────┘                                      └───────────────┘
                  ONE agent bubble, 4 phases each:
                    0│ 🔎 query_demand ⇄ pop_data (Supabase)     ◄── FIX #1 grounding (tool loop)
                     │     ↳ real coords + nearest existing stops
                    1│ written analysis
                    2│ propose_route  → sortRouteStops (path-safe)  ◄── FIX #4
                    3│ repairRoute (bounds/dedupe/transfer)         ◄── FIX #3
                          │
                          ▼  (once BOTH routes exist)
                  ┌─────────────────────────────────────────────┐
                  │  sim   runSimulation × 2  (150 agents)        │ ◄── FIX #2 (was missing entirely)
                  │  → accessibility, equity, ridership, time     │
                  │  → emits sim_update;  stored in state.simA/B  │
                  └─────────────────────────────────────────────┘
                          │
                          ▼
                  ┌─────────────────┐
                  │  criticRouter   │  (orchestrator directive)
                  └─────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
        ┌──────────────┐    ┌──────────────┐
        │ nimby (Haiku)│ ⇄  │  pr  (Haiku)  │   cast_votes ballots
        │ Margaret     │    │  Devon        │   ← now also see sim outcome
        └──────────────┘    └──────────────┘
                          │
                          ▼
                     ┌─────────┐
                     │  tally  │  stops objected to by BOTH critics = contested
                     └─────────┘
                          │
              contested ≥2 & revisions left?
                ┌─────────┴───────────┐
            yes │                     │ no
                ▼                     ▼
          ┌──────────┐         ┌──────────────────────────────────────────┐
          │  revise  │         │  commission  (Sonnet)                      │
          │ stash    │         │  • gets exact-coord JSON + sim   ◄── FIX #5 │
          │ prior*   │         │  • commission_ruling: approve / reject     │
          │ +priorSim│ ◄──FIX#2│  • propose_route → repairRoute   ◄── FIX #3 │
          └──────────┘ feedback└──────────────────────────────────────────┘
                │   loop              │             │
                └──────► plannerRouter│        approve / max revisions
              (planners re-propose    │             │
               WITH their route's     ▼             ▼
               measured sim outcome) reject→revise  END → route_final ──► client
```

## The core shift

The old graph was a blind → critique → vote loop: planners guessed coordinates and
never saw any quantitative outcome. Now there is a **grounding step before** proposing
(real data in) and a **measurement step after** (real outcome out), and that outcome
feeds the revision loop — so each round is informed by data instead of re-rolling the dice.

## The five root-cause fixes

| # | Problem (live graph, before) | Fix | Key location |
|---|------------------------------|-----|--------------|
| 1 | Planners got only neighbourhood/station **names** → invented lat/lon from memory | `query_demand` read-tool loop: real census population + nearest existing stops, queried before proposing | [council-demand-tools.ts](web/src/server/council-demand-tools.ts), `streamMessageWithReadTools` in [anthropic.ts](web/src/server/anthropic.ts), Phase 0 of `streamRouteTurn` |
| 2 | The graph ran **no simulation at all**; planners got only critic opinion | New `sim` node runs the 150-agent sim on both routes; results flow to critics, commission, and back to planners on revision | `simNode` + `revisionContext` in [council-graph.ts](web/src/server/council-graph.ts) |
| 3 | Hard geometric rules were advisory; invalid routes shipped | Deterministic `repairRoute`: drop out-of-bounds stops, de-dupe (<250 m), relabel near-existing stops as transfers | `repairRoute`, applied in planner + commission turns |
| 4 | `sortRouteStops` always re-projected onto one axis → mangled L-shaped routes | Keep the projection order only when it produces a **shorter** path; else preserve the planner's order | `sortRouteStops` in [council-graph.ts](web/src/server/council-graph.ts) |
| 5 | Commission received stop **names only** → re-hallucinated coordinates | Commission prompt now includes exact-coordinate JSON + the simulated outcome | `commissionNode` in [council-graph.ts](web/src/server/council-graph.ts) |

## Caveats / not-yet-verified

- The agentic `query_demand` loop (#1) is wired on the **Anthropic** provider (the default).
  Gemini has no tool-use loop, so it gracefully **skips** grounding (guarded by
  `if (provider.streamMessageWithReadTools)`) — no worse than before, but not improved.
- Needs a **live run** to confirm: `query_demand` loop latency is acceptable, and a full
  2-revision run doesn't trip LangGraph's `recursionLimit` (bumped 20 → 40 for the extra `sim` node).
- Requires API keys + Supabase (`pop_data`) + the Python ridership server for the full pipeline.
```
