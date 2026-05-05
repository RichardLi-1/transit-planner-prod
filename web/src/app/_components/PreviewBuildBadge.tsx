"use client";

import { useEffect, useState } from "react";

const PREVIEW_PREFIXES = ["test.", "beta."];

export default function PreviewBuildBadge() {
  const [showBadge, setShowBadge] = useState(false);
  const [animateOnLoad, setAnimateOnLoad] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const isPreviewHost = PREVIEW_PREFIXES.some((prefix) => hostname.startsWith(prefix));
    if (!isPreviewHost) return;

    setShowBadge(true);
    setAnimateOnLoad(true);
    const timeout = window.setTimeout(() => setAnimateOnLoad(false), 1400);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!showBadge) return null;

  return (
    <div
      className={[
        // # 📖 Learn: CSS animations via utility classes and conditional class composition.
        "pointer-events-none fixed top-3 right-3 z-[9999] rounded-md border border-amber-300 bg-amber-100/95 px-3 py-1.5",
        "text-[11px] font-semibold uppercase tracking-wide text-amber-900 shadow-sm backdrop-blur-sm",
        animateOnLoad ? "animate-pulse" : "",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      Preview Build
    </div>
  );
}
