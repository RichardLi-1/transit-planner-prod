"use client";

import { useEffect, useRef, useState } from "react";
import { TransitAssistant } from "./TransitAssistant";
import type { Route } from "~/app/map/transit-data";

interface Props {
  routes: Route[];
  onClose: () => void;
  /**
   * True when a right-side panel (Sim, Plans, Route, Generated) is open and
   * occupies the right edge of the screen. The chat panel will slide left if
   * it would overlap with that rail.
   */
  avoidRightRail: boolean;
  /** Text to pre-fill the chat input (one-shot — TransitAssistant consumes it via onSeedConsumed). */
  seed?: string | null;
  onSeedConsumed?: () => void;
}

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;
// Width of the right rail (panel + margins). Empirical: panels are ~330px
// wide at right: 24px, so anything past viewport.width - 378 overlaps.
const RIGHT_RAIL_RESERVED = 378;
// Bumped to _v2 so a previously-saved (top-left) position from before the
// bottom-right default is discarded — old keys would otherwise override it.
const STORAGE_KEY = "t_aiChatPos_v2";

function clampToViewport(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - 120, y)),
  };
}

function defaultPosition() {
  if (typeof window === "undefined") return { x: 100, y: 100 };
  // Bottom-right by default — clear of the top-centre toolbar. clampToViewport
  // keeps it fully on-screen on small windows. If a right-rail panel is open,
  // the avoidRightRail effect slides it left after mount.
  return clampToViewport(
    window.innerWidth - PANEL_WIDTH - 24,
    window.innerHeight - PANEL_HEIGHT - 24,
  );
}

// Read a previously-saved (and clamped) position, or null if none/invalid.
function readSavedPosition(): { x: number; y: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && "x" in parsed && "y" in parsed) {
        const x = Number((parsed as { x: number }).x);
        const y = Number((parsed as { y: number }).y);
        if (Number.isFinite(x) && Number.isFinite(y)) return clampToViewport(x, y);
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function AIChatPanel({ routes, onClose, avoidRightRail, seed, onSeedConsumed }: Props) {
  // Position is the SOURCE OF TRUTH for where this panel sits. Initialise it to
  // the saved position (or the bottom-right default) immediately so the panel
  // mounts in place instead of animating in from the top-left corner. The lazy
  // initialiser keeps this SSR-safe (returns a neutral value if no window).
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { x: 100, y: 100 };
    return readSavedPosition() ?? defaultPosition();
  });
  const [dragging, setDragging] = useState(false);

  // Persist position whenever it settles (not during drag).
  useEffect(() => {
    if (dragging) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos, dragging]);

  // Collision avoidance: when the right rail opens, slide left if needed.
  useEffect(() => {
    if (!avoidRightRail) return;
    setPos((prev) => {
      const maxX = window.innerWidth - RIGHT_RAIL_RESERVED - PANEL_WIDTH;
      if (prev.x <= maxX) return prev;
      // 📖 Learn: returning the SAME object when no change is needed lets
      // React skip an extra render. We only allocate a new object when we
      // actually shift.
      return { x: Math.max(8, maxX), y: prev.y };
    });
  }, [avoidRightRail]);

  // Re-clamp on window resize so the panel can't get stranded off-screen.
  useEffect(() => {
    function onResize() {
      setPos((p) => clampToViewport(p.x, p.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function startDrag(e: React.MouseEvent) {
    // Only drag with primary mouse button; ignore clicks on the close button.
    if (e.button !== 0) return;
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPosX = pos.x;
    const startPosY = pos.y;
    setDragging(true);

    // 📖 Learn: defining onMove/onUp INSIDE startDrag is deliberate — they
    // close over startMouseX/startPosX from this drag session. Defining them
    // at component scope would force us to keep that data in refs and deal
    // with stale closures from useState. Same pattern as the linesHeight
    // resizer in TransitMap.tsx.
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      setPos(clampToViewport(startPosX + dx, startPosY + dy));
    }
    function onUp() {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="pointer-events-auto fixed z-30 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: PANEL_WIDTH,
        // Auto height that hugs the content (so the empty state is compact, not
        // a tall box with a gap) but never grows past PANEL_HEIGHT — past that
        // the message list scrolls instead. The body's flex-1 + min-h-0 makes
        // the scroll work once this cap is hit.
        maxHeight: PANEL_HEIGHT,
        // Smooth slide when collision-avoidance shifts the panel, but no
        // transition during user drag (it would lag behind the cursor).
        transition: dragging ? "none" : "left 0.25s ease, top 0.25s ease",
      }}
    >
      {/* Drag handle / header */}
      <div
        onMouseDown={startDrag}
        className={`flex shrink-0 items-center gap-2 border-b border-stone-100 px-4 py-3 select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-600">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 1.5L9.5 6L14 7.5L9.5 9L8 13.5L6.5 9L2 7.5L6.5 6Z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-stone-800">Ask AI</p>
        <p className="ml-auto text-[11px] text-stone-400">drag to move</p>
        <button
          onMouseDown={(e) => e.stopPropagation()} // don't start a drag from the close button
          onClick={onClose}
          aria-label="Close"
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
            <path d="M4 4L12 12M12 4L4 12" />
          </svg>
        </button>
      </div>

      {/* Chat body */}
      <div className="flex-1 min-h-0 p-3">
        <TransitAssistant routes={routes} seed={seed} onSeedConsumed={onSeedConsumed} />
      </div>
    </div>
  );
}
