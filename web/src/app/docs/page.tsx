import { type Metadata } from "next";
import Link from "next/link";
import { InfoNav } from "../_components/InfoNav";
import { InfoFooter } from "../_components/InfoFooter";
import { DocsChatWidget } from "./_components/DocsChatWidget";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "User guides and technical reference for Transit Planner — the AI-assisted, map-first workspace for sketching transit lines, running AI council debates, and exporting GTFS feeds.",
  openGraph: {
    title: "Transit Planner Docs",
    description:
      "User guides and technical reference for Transit Planner.",
    url: "/docs",
  },
  twitter: {
    title: "Transit Planner Docs",
    description:
      "User guides and technical reference for Transit Planner.",
  },
};

const LINE_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"];

const docCards = [
  {
    href: "/docs/user",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26C17.81 13.47 19 11.38 19 9c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M9 21h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
    color: "#2563eb",
    accentBg: "#eff6ff",
    label: "For planners",
    title: "User Guide",
    description: "How to draw routes, edit stops, run the AI council, and export planning-ready GTFS files.",
    sections: ["Map Basics", "Lines Panel", "Add Stops", "Neighbourhood Selection", "GTFS Import/Export", "AI Council"],
  },
  {
    href: "/docs/technical",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M14 3l-4 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    color: "#7c3aed",
    accentBg: "#f5f3ff",
    label: "For developers",
    title: "Technical Reference",
    description: "Architecture overview, primary modules, deployment notes, and environment variable reference.",
    sections: ["Architecture", "Primary Modules", "Runtime & Deployment", "Environment Variables", "Roadmap"],
  },
];

const quickLinks = [
  {
    href: "/map",
    label: "Open App",
    description: "Jump into the map editor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/about",
    label: "About",
    description: "Platform overview and features",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/terms",
    label: "Terms of Use",
    description: "Usage terms and limitations",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9 12h6M9 16h6M9 8h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/privacy",
    label: "Privacy Policy",
    description: "How we handle your data",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function DocsIndexPage() {
  return (
    // 📖 Learn: #f8f7f4 is a warm off-white ("cream") — slightly yellow-tinted white that reads as intentional, not default
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f7f4" }}>
      <InfoNav />

      {/* Hero — editorial, light, centered */}
      <section style={{ padding: "80px 24px 72px", textAlign: "center" }}>
        {/* Brand pill badge */}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 14px", borderRadius: 99,
            backgroundColor: "#eef2ff",
            border: "1px solid #c7d2fe",
            marginBottom: 32,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="#4338ca" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="#4338ca" strokeWidth="2.5" />
          </svg>
          <span style={{ color: "#4338ca", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.01em" }}>Documentation</span>
        </div>

        {/* Main headline — large editorial treatment */}
        <h1
          style={{
            fontFamily: "Google Sans Display, Georgia, serif",
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 700,
            color: "#0f0e17",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            marginBottom: 20,
          }}
        >
          Transit Planner
          <br />
          <span style={{ color: "#3730a3" }}>Docs</span>
        </h1>

        <p
          style={{
            fontSize: 17,
            color: "#57534e",
            maxWidth: 480,
            margin: "0 auto",
            lineHeight: 1.7,
          }}
        >
          User guides and technical reference for an AI-assisted, map-first
          workspace for sketching transit lines.
        </p>

        {/* Transit line color stripes — decorative, brand accent */}
        <div
          style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: 5, marginTop: 48,
          }}
        >
          {LINE_COLORS.map((color, i) => (
            <div
              key={i}
              style={{
                height: 4,
                // Vary widths to feel more like real transit lines, less like a loading bar
                width: i === 0 || i === 5 ? 28 : i === 2 ? 52 : 40,
                borderRadius: 99,
                backgroundColor: color,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </section>

      {/* Doc cards */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
          {docCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              style={{
                display: "block",
                padding: "36px 32px",
                borderRadius: 20,
                // White card on cream background — elevated via shadow, not border
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)",
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.04)",
              }}
            >
              {/* Category label above card title */}
              <p
                style={{
                  fontSize: 11.5, fontWeight: 600,
                  color: card.color,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                {card.label}
              </p>

              {/* Icon + title row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
                <div
                  style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    backgroundColor: card.accentBg,
                    color: card.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {card.icon}
                </div>
                <h2
                  style={{
                    fontFamily: "Google Sans Display, Georgia, serif",
                    fontSize: 26, fontWeight: 700,
                    color: "#0f0e17",
                    lineHeight: 1.15,
                    letterSpacing: "-0.02em",
                    marginTop: 4,
                  }}
                >
                  {card.title}
                </h2>
              </div>

              <p style={{ fontSize: 14.5, color: "#78716c", lineHeight: 1.7, marginBottom: 22 }}>
                {card.description}
              </p>

              {/* Section pills — refined: border outline style instead of filled */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 28 }}>
                {card.sections.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: 12, fontWeight: 500,
                      padding: "4px 11px", borderRadius: 99,
                      color: card.color,
                      border: `1.5px solid ${card.color}22`,
                      backgroundColor: card.accentBg,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 13.5, fontWeight: 600,
                  color: card.color,
                  paddingBottom: 1,
                  borderBottom: `1.5px solid ${card.color}`,
                }}
              >
                Read docs
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{ maxWidth: 960, margin: "60px auto 0", padding: "0 24px" }}>
        <div style={{ height: 1, backgroundColor: "#e8e4dc" }} />
      </div>

      {/* Quick links — horizontal, more minimal */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 72px" }}>
        <p
          style={{
            fontSize: 11.5, fontWeight: 600,
            color: "#a8a29e",
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 20,
          }}
        >
          Quick Links
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 18px", borderRadius: 12,
                backgroundColor: "#ffffff",
                border: "1px solid #e8e4dc",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  backgroundColor: "#f1ede6",
                  color: "#57534e",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {link.icon}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1917" }}>{link.label}</div>
                <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 1 }}>{link.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <InfoFooter />
      <DocsChatWidget />
    </div>
  );
}
