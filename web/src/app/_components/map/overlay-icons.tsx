import type { ReactNode } from "react";

// Compact 16×16 glyphs for each map overlay, keyed by the OverlaySpec `id`.
// Kept here (not inline in TransitMap) so the 11 SVGs don't bloat that file,
// and so the icon set lives in one place that's easy to scan/tweak.
//
// Convention: viewBox 0 0 16 16, h-4 w-4, and stroke/fill="currentColor" so the
// chip can tint the icon via CSS `color` (overlay colour when on, grey when off).
const cls = "h-4 w-4";

export const OVERLAY_ICONS: Record<string, ReactNode> = {
  // Population Density → two people
  heatmap: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <circle cx="6" cy="5.5" r="2" />
      <path d="M2.8 12.5c0-2 1.4-3.3 3.2-3.3s3.2 1.3 3.2 3.3" />
      <path d="M10.6 4a1.8 1.8 0 0 1 .2 3.5" />
      <path d="M11 9.4c1.4.2 2.4 1.4 2.4 3.1" />
    </svg>
  ),
  // Traffic → car
  traffic: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M2.5 9.5l1-3.2A1.8 1.8 0 0 1 5.2 5h5.6a1.8 1.8 0 0 1 1.7 1.3l1 3.2" />
      <path d="M2 9.5h12v2.3a.6.6 0 0 1-.6.6h-1.1a.6.6 0 0 1-.6-.6v-.6H4.3v.6a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6z" />
    </svg>
  ),
  // Canada pop density (country-wide) → globe
  canadaPop: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.8 1.6 2.8 3.8 2.8 6S9.8 12.4 8 14C6.2 12.4 5.2 10.2 5.2 8S6.2 3.6 8 2z" />
    </svg>
  ),
  // Station labels → tag
  stationLabels: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M8.5 2H13a1 1 0 0 1 1 1v4.5a1 1 0 0 1-.3.7l-6 6a1 1 0 0 1-1.4 0L2.3 9.7a1 1 0 0 1 0-1.4l6-6A1 1 0 0 1 8.5 2z" />
      <circle cx="11" cy="5" r="1" />
    </svg>
  ),
  // Coverage Zones → filled radius
  coverage: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className={cls}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Service Heatmap → grid
  serviceHeatmap: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" className={cls}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  ),
  // Live vehicles → bus
  liveVehicles: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <rect x="3" y="2.5" width="10" height="9" rx="1.5" />
      <path d="M3 7h10" />
      <path d="M5 11.5v1.5M11 11.5v1.5" />
      <circle cx="5.5" cy="9.3" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="9.3" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Transit deserts → warning triangle
  transitDesert: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M8 2.5l5.5 9.5a.8.8 0 0 1-.7 1.2H3.2a.8.8 0 0 1-.7-1.2z" />
      <path d="M8 6.5v3M8 11.4v.01" />
    </svg>
  ),
  // Catchment circles → dashed radius
  catchment: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className={cls}>
      <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Disruption zones → lightning bolt
  disruption: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M8.5 2L4 9h3l-.5 5L11 7H8z" />
    </svg>
  ),
  // Isochrone (travel time) → clock
  isochrone: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  ),
  // AI findings → sparkle
  aiFindings: (
    <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
      <path d="M8 1.5l1.2 3.3L12.5 6 9.2 7.2 8 10.5 6.8 7.2 3.5 6l3.3-1.2z" />
      <path d="M12.4 10l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4L10.5 12l1.4-.5z" />
    </svg>
  ),
};
