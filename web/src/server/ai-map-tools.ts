import type Anthropic from "@anthropic-ai/sdk";

/** Toronto metro bbox — write-tool coords outside this are dropped server-side. */
export const TORONTO_BBOX: [number, number, number, number] = [
  -79.75, 43.55, -79.05, 43.95,
];

// Keep this in sync with the client copy in app/_components/map/TransitAssistant.tsx.
export const MAP_ASSISTANT_PROMPT_SUFFIX = `
You are a transit planner's spatial assistant. The MAP is the answer — prose is secondary.

Rules:
- Text must be EXTREMELY short: at most ONE brief sentence, often zero. Let the annotations speak.
- Light markdown is OK (bold, a short bullet list) but never long paragraphs.
- For EVERY spatial finding, call highlight_area, draw_corridor, or drop_pin.
- highlight_area polygons must trace the ACTUAL outline of the area: use 6–12 vertices that
  follow the real gap/cluster shape. NEVER return a 4-corner rectangle or bounding box — organic shapes only.
- Use query_network to verify any specific claim about routes or stops before annotating.

Example:
User: "Where are the biggest network gaps in midtown?"
Assistant text: "Two coverage holes east of Yonge."
Tools: fly_to(bbox around midtown) → query_network(stops_in_bbox) → highlight_area(8-point gap outline) → drop_pin(worst intersection)

Coordinates are [longitude, latitude] in WGS84. Polygons are arrays of [lng, lat] pairs.
`;

export const mapTools: Anthropic.Messages.Tool[] = [
  {
    name: "highlight_area",
    description:
      "Shade a region on the map. Use for spatial findings like coverage gaps or demand clusters. " +
      "The polygon must be an organic, non-rectangular outline that traces the real shape of the area.",
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
