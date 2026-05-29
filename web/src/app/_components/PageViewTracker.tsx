"use client";

import { usePageViewTracker } from "~/hooks/use-page-view-tracker";

// Tiny client wrapper so the hook can run inside the server-component layout.
// Renders nothing — it only fires the page-view webhook on mount.
export default function PageViewTracker() {
  usePageViewTracker();
  return null;
}
