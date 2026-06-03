"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function shouldSkipTracking() {
  try {
    return localStorage.getItem("skip_tracking") !== null;
  } catch {
    return false;
  }
}

export default function TrackingIntegrations() {
  return (
    <>
      <Analytics
        beforeSend={(event: BeforeSendEvent) =>
          shouldSkipTracking() ? null : event
        }
      />
      <SpeedInsights
        beforeSend={(event) => (shouldSkipTracking() ? null : event)}
      />
    </>
  );
}
