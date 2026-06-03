"use client";

import mixpanel from "mixpanel-browser";

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

let didInit = false;

function shouldSkipAnalytics() {
  if (typeof window === "undefined") return true;

  try {
    return localStorage.getItem("skip_tracking") !== null;
  } catch {
    return false;
  }
}

function initMixpanel() {
  if (didInit || shouldSkipAnalytics() || !MIXPANEL_TOKEN) return;

  mixpanel.init(MIXPANEL_TOKEN, {
    autocapture: true,
    debug: process.env.NODE_ENV === "development",
    persistence: "localStorage",
    track_pageview: true,
  });

  didInit = true;
}

function cleanProps(props: AnalyticsProps): AnalyticsProps {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  );
}

export function initAnalytics() {
  initMixpanel();
}

export function identifyAnalyticsUser(
  distinctId: string,
  traits?: AnalyticsProps,
) {
  if (!distinctId) return;
  initMixpanel();
  if (!MIXPANEL_TOKEN || shouldSkipAnalytics()) return;

  mixpanel.identify(distinctId);
  if (traits && Object.keys(traits).length > 0) {
    mixpanel.people.set(cleanProps(traits));
  }
}

export function registerAnalyticsSuperProps(props: AnalyticsProps) {
  initMixpanel();
  if (!MIXPANEL_TOKEN || shouldSkipAnalytics()) return;

  mixpanel.register(cleanProps(props));
}

export function trackEvent(event: string, props: AnalyticsProps = {}) {
  initMixpanel();
  if (!MIXPANEL_TOKEN || shouldSkipAnalytics()) return;

  mixpanel.track(event, cleanProps(props));
}
