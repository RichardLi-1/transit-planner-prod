"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoNav } from "../../_components/InfoNav";
import { InfoFooter } from "../../_components/InfoFooter";
import { DocsChatWidget } from "../_components/DocsChatWidget";

const LAST_UPDATED = "March 16, 2026";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "stack", label: "Technology Stack" },
  { id: "modules", label: "Primary Modules" },
  { id: "runtime", label: "Runtime & Deployment" },
  { id: "env-vars", label: "Environment Variables" },
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
              color: active ? "#7c3aed" : "#78716c",
              backgroundColor: active ? "#f5f3ff" : "transparent",
              textDecoration: "none",
              marginBottom: 2,
              borderLeft: `2px solid ${active ? "#7c3aed" : "transparent"}`,
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
          href="/docs/user"
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
            <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26C17.81 13.47 19 11.38 19 9c0-3.87-3.13-7-7-7z" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 12.5, color: "#57534e", fontWeight: 500 }}>User Guide</span>
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

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", marginBottom: 10, marginTop: 28, letterSpacing: "-0.01em" }}>
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14.5, color: "#57534e", lineHeight: 1.8, marginBottom: 16 }}>
      {children}
    </p>
  );
}

function CodeBadge({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        backgroundColor: "#f1ede6", color: "#1c1917",
        padding: "2px 6px", borderRadius: 5,
        border: "1px solid #e8e4dc",
      }}
    >
      {children}
    </code>
  );
}

function ModuleCard({
  name, path, description, color = "#7c3aed",
}: {
  name: string; path: string; description: string; color?: string;
}) {
  return (
    <div
      style={{
        padding: "16px 18px", borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.06)",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.04)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            fontSize: 11.5, fontWeight: 700, color,
            padding: "3px 9px", borderRadius: 6, flexShrink: 0, marginTop: 1,
            whiteSpace: "nowrap",
            border: `1.5px solid ${color}22`,
            backgroundColor: `${color}0d`,
          }}
        >
          {name}
        </div>
        <div>
          <CodeBadge>{path}</CodeBadge>
          <p style={{ fontSize: 13.5, color: "#78716c", lineHeight: 1.65, marginTop: 7 }}>{description}</p>
        </div>
      </div>
    </div>
  );
}

function EnvVar({ name, required, description }: { name: string; required: boolean; description: string }) {
  return (
    <div
      style={{
        padding: "14px 16px", borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.06)",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
        <CodeBadge>{name}</CodeBadge>
        <span
          style={{
            fontSize: 11, fontWeight: 700,
            padding: "2px 8px", borderRadius: 99,
            backgroundColor: required ? "#fef2f2" : "#f1ede6",
            color: required ? "#dc2626" : "#78716c",
            border: `1px solid ${required ? "#fecaca" : "#e8e4dc"}`,
          }}
        >
          {required ? "Required" : "Optional"}
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: "#78716c", lineHeight: 1.65, margin: 0 }}>{description}</p>
    </div>
  );
}

export default function TechnicalDocsPage() {
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
            <span style={{ fontSize: 12.5, color: "#57534e", fontWeight: 500 }}>Technical Reference</span>
          </div>

          {/* Category label */}
          <p style={{ fontSize: 11.5, fontWeight: 600, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            For developers
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
            Technical Reference
          </h1>
          <p style={{ fontSize: 15.5, color: "#78716c", maxWidth: 560, lineHeight: 1.65 }}>
            Architecture, modules, and deployment notes for the Transit Planner application.
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
            Transit Planner is a Next.js (App Router) frontend centered around an interactive Mapbox GL editor.
            It includes GTFS import/export utilities and an AI council interface that can stream route proposals.
            Some analysis modules are not yet implemented and are called out as "in the works."
          </Prose>
          <Prose>
            The application is structured as a single Next.js project under <CodeBadge>/web</CodeBadge>. All
            client-facing logic lives in <CodeBadge>src/app</CodeBadge> and <CodeBadge>src/lib</CodeBadge>.
            Server-side API routes live under <CodeBadge>src/app/api</CodeBadge> and should not be modified
            unless you are extending server functionality.
          </Prose>

          <SectionHeading id="stack">Technology Stack</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
            {[
              { name: "Next.js 15", role: "App Router framework", color: "#1c1917" },
              { name: "React 19", role: "UI rendering", color: "#0891b2" },
              { name: "Mapbox GL", role: "Map rendering", color: "#dc2626" },
              { name: "Tailwind CSS 4", role: "Styling", color: "#0891b2" },
              { name: "Three.js", role: "3D globe on landing", color: "#7c3aed" },
              { name: "Auth0", role: "Authentication", color: "#d97706" },
              { name: "Supabase", role: "Data persistence", color: "#16a34a" },
              { name: "Google Sans", role: "Typography", color: "#2563eb" },
            ].map((item) => (
              <div
                key={item.name}
                style={{
                  padding: "12px 14px", borderRadius: 10,
                  backgroundColor: "#ffffff",
                  border: `1.5px solid ${item.color}22`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.name}</div>
                <div style={{ fontSize: 12, color: "#78716c", marginTop: 3 }}>{item.role}</div>
              </div>
            ))}
          </div>

          <SectionHeading id="modules">Primary Modules</SectionHeading>

          <SubHeading>Map Editor</SubHeading>
          <ModuleCard
            name="Map Editor"
            path="src/app/_components/TransitMap.tsx"
            description="The main Mapbox GL editor. Manages all map state: routes, stops, neighbourhoods, draw modes, overlays, undo/redo, GTFS export/import, and council preview visualization."
          />
          <ModuleCard
            name="Lines Panel"
            path="src/app/_components/map/RoutePanel.tsx"
            description="Displays route details, stops list, population served, and line controls. Used for both static and generated routes."
          />
          <ModuleCard
            name="Station Popup"
            path="src/app/_components/map/StationPopup.tsx"
            description="Positioned popup with station info, connections, AI-generated station analysis, and estimated ridership."
          />
          <ModuleCard
            name="Neighbourhood Panel"
            path="src/app/_components/map/NeighbourhoodPanel.tsx"
            description="Shows neighbourhood context: population density, traffic level, employment info, street view imagery, and transit lines in the area."
          />

          <SubHeading>AI & Chat</SubHeading>
          <ModuleCard
            name="Chat Panel"
            path="src/app/_components/ChatPanel.tsx"
            description="Multi-agent chat interface. Hosts five distinct planning agents, streams responses, extracts route proposals from markdown, and generates HTML reports."
            color="#7c3aed"
          />

          <SubHeading>GTFS Utilities</SubHeading>
          <ModuleCard
            name="GTFS Export"
            path="src/lib/gtfs.ts"
            description="Generates core GTFS CSVs (routes, stops, stop_times, trips, shapes) and zips them for download. Includes built-in validation before export."
            color="#16a34a"
          />
          <ModuleCard
            name="GTFS Import"
            path="src/lib/gtfs-import.ts"
            description="Reads a GTFS ZIP and converts it into Route objects compatible with the map editor's internal state."
            color="#16a34a"
          />

          <SubHeading>Data</SubHeading>
          <ModuleCard
            name="Static Route Data"
            path="src/app/map/transit-data.ts"
            description="Base routes and stops pre-loaded into the editor. Contains the default Toronto transit network (~745KB). Used as the starting dataset."
            color="#d97706"
          />
          <ModuleCard
            name="Geo Utilities"
            path="src/app/map/geo-utils.ts"
            description="Geospatial helper functions: great-circle calculations, bounds computation, coordinate projections, and stop distance utilities."
            color="#d97706"
          />

          <SectionHeading id="runtime">Runtime & Deployment</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Local development", desc: "Run the Next.js dev server and point it at your own backing services (AI model provider, auth, storage).", color: "#2563eb", border: "#bfdbfe" },
              { label: "Self-hosted / server", desc: "Build and deploy the Next.js app to any server or platform that supports Node.js (e.g., Vercel, Fly.io, AWS).", color: "#16a34a", border: "#bbf7d0" },
              { label: "Mapbox dependency", desc: "Requires a public Mapbox access token. Map tiles and geocoding run client-side against the Mapbox API.", color: "#dc2626", border: "#fecaca" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "14px 16px", borderRadius: 10,
                  backgroundColor: "#ffffff",
                  border: `1px solid ${item.border}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: item.color, flexShrink: 0, whiteSpace: "nowrap", marginTop: 2 }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 13.5, color: "#57534e", lineHeight: 1.65 }}>{item.desc}</span>
              </div>
            ))}
          </div>

          <SectionHeading id="env-vars">Environment Variables</SectionHeading>
          <Prose>
            Set these in a <CodeBadge>.env.local</CodeBadge> file at the project root (or in your deployment
            platform's environment settings).
          </Prose>
          <EnvVar name="NEXT_PUBLIC_MAPBOX_TOKEN" required description="Public Mapbox access token. Used for map tile rendering, geocoding, and map interactions. Exposed to the browser." />
          <EnvVar name="AUTH0_SECRET" required={false} description="Auth0 session secret for server-side session encryption. Required if authentication is enabled." />
          <EnvVar name="AUTH0_BASE_URL" required={false} description="The base URL of your deployment (e.g., http://localhost:3000). Used by the Auth0 SDK for callback URLs." />
          <EnvVar name="AUTH0_ISSUER_BASE_URL" required={false} description="Your Auth0 tenant domain (e.g., https://your-tenant.auth0.com)." />
          <EnvVar name="AUTH0_CLIENT_ID" required={false} description="Auth0 application client ID." />
          <EnvVar name="AUTH0_CLIENT_SECRET" required={false} description="Auth0 application client secret. Server-side only, never exposed to the browser." />
          <EnvVar name="NEXT_PUBLIC_SUPABASE_URL" required={false} description="Supabase project URL for data persistence features." />
          <EnvVar name="NEXT_PUBLIC_SUPABASE_ANON_KEY" required={false} description="Supabase anonymous public key. Used for client-side data operations." />

          <SectionHeading id="roadmap">Roadmap</SectionHeading>
          <Prose>The following modules are planned and not yet fully implemented:</Prose>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Accessibility analysis inputs", desc: "Upload/retrieve datasets for accessibility analysis: street network, zones, destinations, and demographics." },
              { label: "r5 routing integration", desc: "Integration with the r5 routing engine and open-source accessibility/equity libraries." },
              { label: "Accessibility dashboard", desc: "Dashboard for travel times, accessibility results, and equity indicators across the designed network." },
              { label: "Expanded exports", desc: "Export formats beyond GTFS — maps, full datasets, and summary planning reports." },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 16px", borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #d1d5db", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1917", marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: "#78716c", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
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
