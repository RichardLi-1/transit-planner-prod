"use client";

import { useEffect, useRef } from "react";
import { trackVisit } from "~/lib/track";

// ─── Edit this to add/rename referral sources ─────────────────────────────────
// key   = the URL query param (e.g. "l" matches "?l" or "?l=anything")
// value = display name shown (bolded) in the Discord message
const REFERRAL_SOURCES: Record<string, string> = {
  l: "LinkedIn",
  r: "Resume",
  t: "Twitter/X",
  e: "Email",
  g: "GitHub",
  c: "Cover Letter",
};
// ──────────────────────────────────────────────────────────────────────────────

// Fires a Discord webhook once per page load to log visitor info.
// Using a ref (not state) for `hasTracked` avoids a re-render — it's a mutable
// value we only read internally.
// 📖 Learn: useRef for mutable values — https://react.dev/reference/react/useRef#referencing-a-value-with-a-ref
export function usePageViewTracker() {
  const hasTracked = useRef(false);
  // Holding "/" suppresses the tracker — handy for testing on a live URL.
  const slashKeyHeld = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/") slashKeyHeld.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "/") slashKeyHeld.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const sendVisit = () => {
      if (slashKeyHeld.current) return;
      if (window.location.hostname === "localhost") return;
      if (localStorage.getItem("skip_tracking")) return;

      // Only track once per page load.
      if (hasTracked.current) return;
      hasTracked.current = true;

      const ua = navigator.userAgent;
      const isBot = /bot|crawler|spider/i.test(ua);
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
      const deviceType = isMobile ? "📱 Mobile" : "🖥️ Desktop";
      const platform = /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Mac/.test(navigator.platform)
            ? "macOS"
            : /Win/.test(navigator.platform)
              ? "Windows"
              : /Linux/.test(navigator.platform)
                ? "Linux"
                : "Unknown";

      // Accumulate visited paths within the session so Discord shows the full
      // journey (e.g. "/" → "/map"). sessionStorage clears when the tab closes.
      const currentPath = window.location.pathname || "/";
      const stored = sessionStorage.getItem("nav_path");
      const pathHistory: string[] = stored
        ? (JSON.parse(stored) as string[])
        : [];
      if (pathHistory[pathHistory.length - 1] !== currentPath) {
        pathHistory.push(currentPath);
      }
      sessionStorage.setItem("nav_path", JSON.stringify(pathHistory));
      const pathTrail = pathHistory.join(" → ");

      // Read ?param, look it up in REFERRAL_SOURCES, then strip all params so
      // the URL bar stays clean. replaceState rewrites the URL without a reload
      // and without adding a history entry (back button unaffected).
      // 📖 Learn: history.replaceState — https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState
      const params = new URLSearchParams(window.location.search);
      const rawParams = params.toString();
      let referralSource: string | null = null;
      for (const key of params.keys()) {
        if (REFERRAL_SOURCES[key]) {
          referralSource = REFERRAL_SOURCES[key];
          break;
        }
      }
      if (rawParams) {
        window.history.replaceState({}, "", window.location.pathname);
      }

      const eventLabel = isBot
        ? `🤖 Bot/crawler on ${currentPath}`
        : referralSource
          ? `👀 New visitor from **${referralSource}**`
          : rawParams
            ? `👀 New visitor — CUSTOM REFERRAL on ${currentPath}`
            : `👀 New visitor on ${currentPath}`;

      // trackVisit() calls our own /api/track — the webhook URL never leaves
      // the server, so it can't be scraped from the browser. IP + geolocation
      // are added server-side from Vercel's edge headers.
      trackVisit(eventLabel, {
        "🖥️ Device": `${deviceType} · ${platform}`,
        "🛤️ Path": pathTrail,
        "🕒 Time": new Date().toLocaleString(),
        ...(rawParams ? { "🔗 Params": `?${rawParams}` } : {}),
        ...(isBot ? { "🔍 UA": ua } : {}),
      });
    };

    sendVisit();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
}
