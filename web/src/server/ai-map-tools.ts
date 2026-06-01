import type Anthropic from "@anthropic-ai/sdk";

/** Toronto metro bbox — write-tool coords outside this are dropped server-side. */
export const TORONTO_BBOX: [number, number, number, number] = [
  -79.75, 43.55, -79.05, 43.95,
];

// Keep this in sync with the client copy in app/_components/map/TransitAssistant.tsx.
export const MAP_ASSISTANT_PROMPT_SUFFIX = `
You are a transit planner's spatial assistant. The MAP is the answer — prose is secondary.

Rules:
- Keep text short (1–2 sentences), but ALWAYS explain what you drew. Light markdown (bold, a short bullet) is OK; never long paragraphs.
- For EVERY spatial finding, call highlight_area, draw_corridor, or drop_pin.
- Whenever you draw a highlight_area, SAY SOMETHING about that polygon in your text: name the place, what the gap/cluster is, and why it matters. Never leave a polygon unexplained.

Highlight discipline — be precise, not lazy:
- NEVER shade water. Lake Ontario, the harbour, rivers and the island channels are not gaps — gaps are about PEOPLE, so polygons must stay over inhabited land.
- Use find_coverage_gaps to get REAL, named gaps instead of guessing; use describe_location to confirm a point is inhabited land (likelyInhabited: true) before you highlight it.
- Keep each polygon FOCUSED on ONE underserved pocket, at most a few km across. Do NOT shade an entire borough, ward, or district — that is not actionable. If a large area is weak, pick the single worst pocket. (Oversized polygons are rejected by the server.)
- Before claiming a gap, use query_network (stops_in_bbox / nearest_stop) to confirm there really are few/no stops there. Don't guess.
- Trace the ACTUAL outline: 6–12 vertices following the real shape. NEVER a 4-corner rectangle or bounding box — organic shapes only.

Example:
User: "Where are the biggest network gaps in midtown?"
Assistant text: "Shaded **Leaside** — dense housing but no rapid transit within ~1.5 km — and pinned the worst intersection."
Tools: fly_to(bbox around midtown) → query_network(stops_in_bbox) → highlight_area(8-point Leaside outline) → drop_pin(worst intersection)

Coordinates are [longitude, latitude] in WGS84. Polygons are arrays of [lng, lat] pairs.
`;

export const mapTools: Anthropic.Messages.Tool[] = [
  {
    name: "highlight_area",
    description:
      "Shade ONE specific underserved pocket or demand cluster — at most a few km across, never a whole " +
      "borough and never over water (Lake Ontario, rivers). Oversized polygons are rejected. " +
      "The polygon must be an organic, non-rectangular outline that traces the real shape of the area. " +
      "Always explain the polygon in your text reply.",
    input_schema: {
      type: "object",
      properties: {
        polygon: {
          type: "array",
          description:
            "Ordered [lng, lat] vertices tracing the area outline. Use 6–12 points that follow the " +
            "actual shape — NOT a 4-corner rectangle or axis-aligned bounding box.",
          minItems: 5,
          items: {
            type: "array",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
        },
        label: {
          type: "string",
          description: "Short label, e.g. 'Midtown north-south gap'",
        },
        color: {
          type: "string",
          enum: ["red", "amber", "teal", "emerald", "sky"],
        },
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
        },
      },
      required: ["polygon", "label", "color"],
    },
  },
  {
    name: "draw_corridor",
    description:
      "Draw a proposed transit line segment between two points.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        },
        to: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        },
        label: { type: "string" },
        mode: {
          type: "string",
          enum: ["subway", "lrt", "streetcar", "bus", "rail"],
        },
      },
      required: ["from", "to", "label"],
    },
  },
  {
    name: "drop_pin",
    description:
      "Mark a specific stop, intersection, or point of interest on the map.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        note: { type: "string" },
        icon: {
          type: "string",
          enum: ["warning", "info", "gap", "hub"],
        },
      },
      required: ["lat", "lng", "note"],
    },
  },
  {
    name: "fly_to",
    description:
      "Move the map camera to show an area before highlighting findings.",
    input_schema: {
      type: "object",
      properties: {
        bbox: {
          type: "array",
          items: { type: "number" },
          minItems: 4,
          maxItems: 4,
        },
        reason: { type: "string" },
      },
      required: ["bbox"],
    },
  },
  {
    name: "describe_location",
    description:
      "Ground yourself at a point BEFORE highlighting. Returns the neighbourhood (if any), " +
      "nearest stop + distance, nearest population centre, and a `likelyInhabited` flag. " +
      "If likelyInhabited is false, the point is probably water or empty land — do NOT highlight there.",
    input_schema: {
      type: "object",
      properties: {
        point: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        },
      },
      required: ["point"],
    },
  },
  {
    name: "find_coverage_gaps",
    description:
      "Server-computed REAL transit gaps: inhabited neighbourhoods whose centre is far " +
      "(default ≥1 km) from any stop, worst-first. Every result is on land and named. " +
      "PREFER this over guessing where gaps are, then highlight_area the worst ones.",
    input_schema: {
      type: "object",
      properties: {
        bbox: {
          type: "array",
          items: { type: "number" },
          minItems: 4,
          maxItems: 4,
        },
        minStopKm: {
          type: "number",
          description: "Distance-to-nearest-stop threshold in km (default 1.0).",
        },
      },
    },
  },
  {
    name: "query_network",
    description:
      "Inspect the current transit network in an area before making claims.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["stops_in_bbox", "routes_in_bbox", "nearest_stop"],
        },
        bbox: {
          type: "array",
          items: { type: "number" },
        },
        point: {
          type: "array",
          items: { type: "number" },
        },
      },
      required: ["kind"],
    },
  },
];

export const WRITE_MAP_TOOLS = new Set([
  "highlight_area",
  "draw_corridor",
  "drop_pin",
  "fly_to",
]);
