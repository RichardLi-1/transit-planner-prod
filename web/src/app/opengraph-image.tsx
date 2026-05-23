import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Transit Planner — AI-Powered Urban Transit Design";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 45%, #1d4ed8 80%, #0891b2 100%)",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Transit line decoration — top */}
        <div style={{ position: "absolute", top: 48, left: 0, right: 0, display: "flex", gap: 0 }}>
          {["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"].map((color) => (
            <div key={color} style={{ flex: 1, height: 4, background: color, opacity: 0.7 }} />
          ))}
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "0 80px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.0,
              letterSpacing: "-0.04em",
              marginBottom: 24,
            }}
          >
            Transit Planner
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.70)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            AI-Powered Urban Transit Design
          </div>
        </div>

        {/* Transit line decoration — bottom */}
        <div style={{ position: "absolute", bottom: 48, left: 0, right: 0, display: "flex", gap: 0 }}>
          {["#0891b2", "#7c3aed", "#d97706", "#dc2626", "#16a34a", "#2563eb"].map((color) => (
            <div key={color} style={{ flex: 1, height: 4, background: color, opacity: 0.7 }} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
