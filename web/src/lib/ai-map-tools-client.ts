/** Shared map-tool helpers (safe for client + server). */

export const COLOR_HEX: Record<string, string> = {
  red: "#ef4444",
  amber: "#f59e0b",
  teal: "#14b8a6",
  emerald: "#10b981",
  sky: "#0ea5e9",
};

export function toolNameToKind(
  name: string,
): "highlight" | "corridor" | "pin" | "flyTo" | null {
  switch (name) {
    case "highlight_area":
      return "highlight";
    case "draw_corridor":
      return "corridor";
    case "drop_pin":
      return "pin";
    case "fly_to":
      return "flyTo";
    default:
      return null;
  }
}

export function labelFromTool(name: string, args: Record<string, unknown>): string {
  if (typeof args.label === "string" && args.label) return args.label;
  if (typeof args.note === "string" && args.note) return args.note;
  if (typeof args.reason === "string" && args.reason) return args.reason;
  return name.replace(/_/g, " ");
}

export function colorFromArgs(args: Record<string, unknown>): string | undefined {
  if (typeof args.color === "string" && args.color in COLOR_HEX) {
    return COLOR_HEX[args.color];
  }
  if (typeof args.mode === "string") {
    const modeColors: Record<string, string> = {
      subway: "#6366f1",
      lrt: "#8b5cf6",
      streetcar: "#f59e0b",
      bus: "#10b981",
      rail: "#0ea5e9",
    };
    return modeColors[args.mode];
  }
  return undefined;
}
