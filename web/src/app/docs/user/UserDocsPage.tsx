"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoNav } from "../../_components/InfoNav";
import { InfoFooter } from "../../_components/InfoFooter";
import { DocsChatWidget } from "../_components/DocsChatWidget";

const LAST_UPDATED = "March 16, 2026";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "map-basics", label: "Map Basics" },
  { id: "lines-panel", label: "Lines Panel" },
  { id: "add-stops", label: "Add Stops to a Line" },
  { id: "neighbourhood-selection", label: "Neighbourhood Selection" },
  { id: "gtfs", label: "Import & Export (GTFS)" },
  { id: "ai-council", label: "AI Planning Council" },
  { id: "roadmap", label: "Roadmap" },
];

function SidebarNav({ activeSection }: { activeSection: string }) {
  return (
    <nav style={{ position: "sticky", top: 80 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        On this page
      </p>
      {sections.map((s) => {
        const active = activeSection === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              display: "block",
              padding: "6px 12px",
              borderRadius: 7,
              fontSize: 13.5,
              fontWeight: active ? 600 : 400,
              color: active ? "#2563eb" : "#78716c",
              backgroundColor: active ? "#eff6ff" : "transparent",
              textDecoration: "none",
              marginBottom: 2,
              borderLeft: `2px solid ${active ? "#2563eb" : "transparent"}`,
              transition: "all 0.15s",
            }}
          >
            {s.label}
          </a>
        );
      })}

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #e8e4dc" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Also in docs
        </p>
        <Link
          href="/docs/technical"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 12px", borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.06)",
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M14 3l-4 18" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 12.5, color: "#57534e", fontWeight: 500 }}>Technical Docs</span>
        </Link>
      </div>
    </nav>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontFamily: "Google Sans Display, Georgia, serif",
        fontSize: 24, fontWeight: 700, color: "#0f0e17",
        marginBottom: 16, marginTop: 52,
        scrollMarginTop: 88, paddingTop: 4,
        letterSpacing: "-0.02em",
      }}
    >
      {children}
    </h2>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.8, marginBottom: 16 }}>
      {children}
    </p>
  );
}

function BulletList({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#2563eb", marginTop: 9, flexShrink: 0 }} />
          <span style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.75 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ type, children }: { type: "tip" | "info"; children: React.ReactNode }) {
  const styles = {
    tip:  { bg: "#f0fdf4", border: "#bbf7d0", label: "Tip",  labelColor: "#16a34a",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round"/></svg> },
    info: { bg: "#eff6ff", border: "#bfdbfe", label: "Note", labelColor: "#2563eb",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2563eb" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/></svg> },
  };
  const s = styles[type];
  return (
    <div style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10 }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>{s.icon}</div>
      <p style={{ fontSize: 13.5, color: "#44403c", lineHeight: 1.7, margin: 0 }}>
        <strong style={{ color: s.labelColor }}>{s.label}:</strong>{" "}{children}
      </p>
    </div>
  );
}

export default function UserDocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((entry) => { if (entry.isIntersecting) setActiveSection(entry.target.id); }); },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    document.querySelectorAll("h2[id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f7f4" }}>
      <InfoNav />

      {/* Page header */}
      <div style={{ padding: "48px 24px 40px", borderBottom: "1px solid #e8e4dc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
            <Link href="/docs" style={{ fontSize: 12.5, color: "#a8a29e", textDecoration: "none", fontWeight: 500 }}>Docs</Link>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontSize: 12.5, color: "#57534e", fontWeight: 500 }}>User Guide</span>
          </div>

          {/* Category label */}
          <p style={{ fontSize: 11.5, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            For planners
          </p>

          <h1
            style={{
              fontFamily: "Google Sans Display, Georgia, serif",
              fontSize: "clamp(28px, 3.5vw, 44px)",
              fontWeight: 700, color: "#0f0e17",
              letterSpacing: "-0.025em", marginBottom: 12,
              lineHeight: 1.1,
            }}
          >
            User Guide
          </h1>
          <p style={{ fontSize: 15.5, color: "#78716c", maxWidth: 560, lineHeight: 1.65 }}>
            How to sketch routes, edit stops, run the planning council, and export GTFS.
          </p>
          <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 12 }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content layout */}
      <div
        style={{
          maxWidth: 1100, margin: "0 auto",
          padding: "44px 24px 80px",
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 56,
          alignItems: "start",
        }}
      >
        <SidebarNav activeSection={activeSection} />

        <article>
          <SectionHeading id="overview">Overview</SectionHeading>
          <Prose>
            The main workspace lives at{" "}
            <Link href="/map" style={{ color: "#2563eb", fontWeight: 500 }}>/map</Link>
            . It combines a Mapbox-based editor, a Lines panel for route visibility and management, and optional
            AI-assisted planning tools. All your edits are reflected live on the map.
          </Prose>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Map editor", color: "#2563eb", bg: "#eff6ff" },
              { label: "Lines panel", color: "#16a34a", bg: "#f0fdf4" },
              { label: "AI council", color: "#7c3aed", bg: "#f5f3ff" },
              { label: "GTFS round-trip", color: "#0891b2", bg: "#ecfeff" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "12px 14px", borderRadius: 10,
                  backgroundColor: "#ffffff",
                  border: `1.5px solid ${item.color}22`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  fontSize: 13, fontWeight: 600, color: item.color,
                }}
              >
                {item.label}
              </div>
            ))}
          </div>

          <SectionHeading id="map-basics">Map Basics</SectionHeading>
          <BulletList items={[
            "Pan and zoom like any standard web map.",
            "Use the top-center toggles to show/hide overlays such as Population Density and Traffic.",
            "Switch tools in the top-center draw toolbar: Explore mode (browse), Select neighbourhoods, and Boundary drawing.",
          ]} />
          <Callout type="tip">
            Use scroll-to-zoom on the map canvas. Hold Ctrl/Cmd and drag to rotate or tilt the view.
          </Callout>

          <SectionHeading id="lines-panel">Lines Panel</SectionHeading>
          <Prose>
            The Lines panel (top-left) groups lines by mode: Subway/LRT, Streetcar, and Bus. Each section can be
            collapsed, and each route can be shown or hidden independently.
            Bus routes start collapsed and hidden by default.
          </Prose>
          <BulletList items={[
            "Collapse a section using its caret. Expand it to see individual routes.",
            "Show/Hide all routes in a section using the eye icon on the section header.",
            "Show/Hide a single route using the eye icon that appears when hovering a route row.",
          ]} />

          <SectionHeading id="add-stops">Add Stops to a Line</SectionHeading>
          <Prose>
            To add stations to an existing or custom line, select it from the Lines panel using the colored pill button
            on the left of the route row. The app will enter "add station" mode and prompt you to click the map.
          </Prose>
          <BulletList items={[
            "Click the line's colored pill button to start adding stations.",
            "Click anywhere on the map to drop a new station.",
            'Click "Done" in the banner to exit add-station mode.',
            "Use Undo/Redo in the bottom toolbar to revert recent edits.",
          ]} />
          <Callout type="info">
            You can click an existing station to open its detail popup, which shows connections, population served,
            and AI-generated station analysis.
          </Callout>

          <SectionHeading id="neighbourhood-selection">Neighbourhood Selection & Boundaries</SectionHeading>
          <BulletList items={[
            "Use Select Neighbourhoods mode to click neighbourhood polygons and build context for planning.",
            "Use Boundary mode to draw a freeform polygon area of interest on the map.",
            "Selected neighbourhoods and boundaries are used as planning context in the AI council flow.",
            "Click a neighbourhood to view population density, traffic levels, and employment data.",
          ]} />

          <SectionHeading id="gtfs">Import & Export (GTFS)</SectionHeading>
          <Prose>
            Use the Import and Export GTFS buttons (top-right area of the map) to round-trip data between the editor
            and GTFS format.
          </Prose>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Export GTFS", desc: "Generates a GTFS ZIP from your current lines and validates the result before download.", color: "#16a34a", border: "#bbf7d0" },
              { label: "Import GTFS", desc: "Loads a GTFS ZIP (or JSON export) and replaces current custom lines and stop edits.", color: "#2563eb", border: "#bfdbfe" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "14px 16px", borderRadius: 10,
                  backgroundColor: "#ffffff",
                  border: `1px solid ${item.border}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  display: "flex", gap: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: item.color, flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>
                  {item.label}
                </div>
                <span style={{ fontSize: 13.5, color: "#57534e", lineHeight: 1.65 }}>{item.desc}</span>
              </div>
            ))}
          </div>

          <SectionHeading id="ai-council">AI Planning Council</SectionHeading>
          <Prose>
            The council is a structured multi-round discussion between specialized AI agents that propose and critique
            a route. It can stream route previews and produce a candidate line that you can further edit.
          </Prose>
          <BulletList items={[
            'Use "Generate Route" to start a new council run when you have enough context selected (neighbourhoods and/or boundary).',
            'Use "View Council" to reopen the council UI for the current session.',
            "When a proposed line is created, it appears as a custom line and is fully editable.",
            "Each AI agent focuses on a different lens: ridership, coverage, equity, transfers, and feasibility.",
          ]} />
          <Callout type="tip">
            Select a few neighbourhoods before running the council to give the AI agents better spatial context
            for their proposals.
          </Callout>

          <SectionHeading id="roadmap">Roadmap</SectionHeading>
          <Prose>The following features are currently in active development:</Prose>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Accessibility analysis inputs — street network, zones, destinations, demographics",
              "r5-based routing engine integration and open-source accessibility/equity libraries",
              "Interactive dashboard for travel times, accessibility results, and equity indicators",
              "Expanded export formats beyond GTFS: maps, datasets, and summary reports",
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "13px 16px", borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Empty circle — "planned but not done" indicator */}
                <div
                  style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "1.5px solid #d1d5db",
                    flexShrink: 0, marginTop: 2,
                  }}
                />
                <span style={{ fontSize: 13.5, color: "#57534e", lineHeight: 1.65 }}>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <InfoFooter />
      <DocsChatWidget />
    </div>
  );
}
