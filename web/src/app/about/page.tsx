import { type Metadata } from "next";
import Link from "next/link";
import { InfoNav } from "../_components/InfoNav";
import { InfoFooter } from "../_components/InfoFooter";

export const metadata: Metadata = {
  title: "About",
  description:
    "Transit Planner is a free web tool for drafting transit routes on an interactive map of Toronto, with an AI planning council that pressure-tests every proposal for ridership, cost, and community impact.",
  openGraph: {
    title: "About Transit Planner — Rethinking How Cities Plan Transit",
    description:
      "Learn about Transit Planner: a web app for urban transit design with AI-powered analysis, GTFS export, and live population data.",
    url: "/about",
  },
  twitter: {
    title: "About Transit Planner — Rethinking How Cities Plan Transit",
    description:
      "Learn about Transit Planner: a web app for urban transit design with AI-powered analysis, GTFS export, and live population data.",
  },
};

const LAST_UPDATED = "March 16, 2026";
const LINE_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"];

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    color: "#2563eb", bg: "#eff6ff",
    title: "Interactive Map Editor",
    description: "Draw transit routes directly on a live Mapbox map. Place stations, define corridors, and visualize your network in real time.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    color: "#7c3aed", bg: "#f5f3ff",
    title: "AI Planning Council",
    description: "Five specialized AI agents evaluate ridership potential, coverage gaps, transfer efficiency, and neighbourhood impact in a structured debate.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    color: "#d97706", bg: "#fffbeb",
    title: "Population & Traffic Data",
    description: "Overlay census population density and traffic patterns. Instantly see how many people your proposed route will serve.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    color: "#0891b2", bg: "#ecfeff",
    title: "GTFS Import & Export",
    description: "Import existing GTFS feeds to visualize real transit networks. Export your designs in standard GTFS format with built-in validation.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    color: "#16a34a", bg: "#f0fdf4",
    title: "Neighbourhood Intelligence",
    description: "Click any area to see population density, traffic levels, employment data, and street-level context — all in one place.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 12h18M3 6h18M3 18h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="19" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    color: "#dc2626", bg: "#fff1f2",
    title: "Lines & Stop Management",
    description: "Organize routes by mode (subway, streetcar, bus). Toggle visibility, edit stops, and manage custom lines with undo/redo support.",
  },
];

const statusItems = [
  { title: "Interactive route sketching on a web map", status: "Implemented", done: true },
  { title: "GTFS generation and validation from sketches", status: "Implemented — export + validation; GTFS import supported", done: true },
  { title: "User and technical documentation", status: "Implemented", done: true },
  { title: "Accessibility analysis inputs (street network, zones, destinations, demographics)", status: "In the works", done: false },
  { title: "Integration with an r5 routing engine + open-source accessibility/equity libraries", status: "In the works", done: false },
  { title: "Interactive dashboard for accessibility results, travel times, and equity indicators", status: "In the works", done: false },
  { title: "Expanded export formats (maps, datasets, and summary reporting)", status: "Partially implemented — GTFS export today; broader exports in the works", done: false },
];

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "About Transit Planner",
  url: "https://transitplanner.app/about",
  description:
    "Transit Planner is a free web tool for drafting transit routes on an interactive map of Toronto, with an AI planning council that pressure-tests every proposal.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://transitplanner.app" },
      { "@type": "ListItem", position: 2, name: "About", item: "https://transitplanner.app/about" },
    ],
  },
  about: {
    "@type": "SoftwareApplication",
    name: "Transit Planner",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
  },
};

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />
      <InfoNav />

      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(150deg, #0f172a 0%, #1e3a5f 40%, #1d4ed8 75%, #0891b2 100%)",
          padding: "88px 24px 80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 700, height: 400, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(59,130,246,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 14px", borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              marginBottom: 28,
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#4ade80" }} />
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500 }}>
              Now in public beta
            </span>
          </div>

          <h1
            style={{
              fontFamily: "Google Sans Display",
              fontSize: "clamp(36px, 5vw, 60px)",
              fontWeight: 700, color: "white",
              lineHeight: 1.1, letterSpacing: "-0.02em",
              marginBottom: 20,
            }}
          >
            Rethinking how cities
            <br />plan their transit
          </h1>

          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.72)", maxWidth: 560, margin: "0 auto 44px", lineHeight: 1.75 }}>
            Transit Planner is a web-based tool for drafting transit routes and stops on an interactive map,
            iterating quickly, and exporting your sketch as a valid GTFS feed — with an AI planning council
            to pressure-test every proposal.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/map"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", borderRadius: 10,
                background: "white", color: "#1d4ed8",
                fontSize: 14, fontWeight: 600, textDecoration: "none",
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              }}
            >
              Start Mapping
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/docs"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
                color: "white", fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}
            >
              Read the Docs
            </Link>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 56, opacity: 0.55 }}>
            {LINE_COLORS.map((color, i) => (
              <div key={i} style={{ height: 3, width: 40, borderRadius: 2, backgroundColor: color }} />
            ))}
          </div>
        </div>
      </section>

      {/* What you can do today */}
      <section style={{ maxWidth: 1152, margin: "0 auto", padding: "80px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {[
            {
              emoji: "🗺️",
              title: "Built for planners",
              body: "Designed around the real workflow of transit planning — from initial corridor sketches to detailed stop-level analysis.",
            },
            {
              emoji: "🧠",
              title: "AI at the core",
              body: "Multi-agent AI evaluates every route you design, surfacing insights that take analysts weeks to compile.",
            },
            {
              emoji: "🌍",
              title: "Open & interoperable",
              body: "First-class GTFS support means your work plays nicely with every major transit planning platform.",
            },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                padding: "32px 28px", borderRadius: 16,
                border: "1px solid #e7e5e4", backgroundColor: "#fafaf9",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 16 }}>{item.emoji}</div>
              <h3 style={{ fontFamily: "Google Sans Display", fontSize: 20, fontWeight: 700, color: "#1c1917", marginBottom: 10 }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 14.5, color: "#78716c", lineHeight: 1.7 }}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ backgroundColor: "#fafaf9", borderTop: "1px solid #e7e5e4", borderBottom: "1px solid #e7e5e4", padding: "80px 24px", marginTop: 80 }}>
        <div style={{ maxWidth: 1152, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              Features
            </p>
            <h2 style={{ fontFamily: "Google Sans Display", fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 700, color: "#1c1917", letterSpacing: "-0.02em", marginBottom: 14 }}>
              Everything you need to plan transit
            </h2>
            <p style={{ fontSize: 16, color: "#78716c", maxWidth: 480, margin: "0 auto" }}>
              From first sketch to exported GTFS feed, Transit Planner covers the full planning workflow.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {features.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "26px 22px", borderRadius: 14,
                  backgroundColor: "#ffffff", border: "1px solid #e7e5e4",
                  display: "flex", flexDirection: "column", gap: 14,
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 10,
                    backgroundColor: f.bg, color: f.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {f.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", marginBottom: 6 }}>{f.title}</h3>
                  <p style={{ fontSize: 13.5, color: "#78716c", lineHeight: 1.65 }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Status */}
      <section style={{ maxWidth: 1152, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Platform Status
          </p>
          <h2 style={{ fontFamily: "Google Sans Display", fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 700, color: "#1c1917", letterSpacing: "-0.02em", marginBottom: 12 }}>
            What's here and what's coming
          </h2>
          <p style={{ fontSize: 15, color: "#78716c", maxWidth: 460, margin: "0 auto" }}>
            Transit Planner is in active development. Here's where things stand.
          </p>
        </div>

        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {statusItems.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                padding: "16px 20px", borderRadius: 12,
                border: `1px solid ${item.done ? "#bbf7d0" : "#e7e5e4"}`,
                backgroundColor: item.done ? "#f0fdf4" : "#fafaf9",
              }}
            >
              <div
                style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  backgroundColor: item.done ? "#16a34a" : "#d1d5db",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {item.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L20 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "white" }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1c1917", marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: item.done ? "#16a34a" : "#78716c" }}>{item.status}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 12.5, color: "#a8a29e", marginTop: 20 }}>
          Last updated: {LAST_UPDATED}
        </p>
      </section>

      {/* CTA */}
      <section style={{ padding: "0 24px 80px" }}>
        <div
          style={{
            maxWidth: 1152, margin: "0 auto", borderRadius: 20,
            background: "linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #0891b2 100%)",
            padding: "56px 48px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 32,
            position: "relative", overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontFamily: "Google Sans Display", fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 700, color: "white", marginBottom: 8, letterSpacing: "-0.015em" }}>
              Ready to plan your network?
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.72)" }}>
              Free to use. Jump straight into the editor at{" "}
              <Link href="/map" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "underline" }}>/map</Link>.
            </p>
          </div>
          <Link
            href="/map"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 10,
              backgroundColor: "white", color: "#1d4ed8",
              fontSize: 14.5, fontWeight: 600, textDecoration: "none",
              position: "relative", zIndex: 1, flexShrink: 0,
            }}
          >
            Start Mapping
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </section>

      <InfoFooter />
    </div>
  );
}
