import posthogPackage from "posthog-js/package.json";
import type { PlannedVisitor, Rng } from "./traffic-model";
import { LOCALES, pickWeighted } from "./traffic-model";

type PostHogEvent = {
  event: string;
  distinct_id: string;
  timestamp: string;
  uuid: string;
  properties: Record<string, unknown>;
};

// The preview has the email-verification flag on, so a successful signup lands here.
const SUCCESS_PATH = "/auth/verify-email?from=signup";
// Longest gap between a visitor's first and last event; keeps every backfilled event in the past.
const MAX_VISIT_MS = 2 * 60 * 1000;
const TAKEN_MESSAGE = "Username or email is already taken";

const DEVICES = [
  {
    weight: 45,
    browser: "Chrome",
    browserVersion: 154,
    os: "Mac OS X",
    osVersion: "10.15.7",
    deviceType: "Desktop",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  },
  {
    weight: 30,
    browser: "Chrome",
    browserVersion: 154,
    os: "Windows",
    osVersion: "10.0",
    deviceType: "Desktop",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  },
  {
    weight: 15,
    browser: "Mobile Safari",
    browserVersion: 26,
    os: "iOS",
    osVersion: "26.0",
    deviceType: "Mobile",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  },
  {
    weight: 10,
    browser: "Firefox",
    browserVersion: 150,
    os: "Windows",
    osVersion: "10.0",
    deviceType: "Desktop",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
  },
];

const REFERRERS: Record<string, string> = {
  reddit: "https://www.reddit.com/",
  google: "https://www.google.com/",
  linkedin: "https://www.linkedin.com/",
};

function uuidv7(timeMs: number, rng: Rng): string {
  const bytes: number[] = [];
  let remaining = timeMs;
  for (let i = 0; i < 6; i++) {
    bytes.unshift(remaining % 256);
    remaining = Math.floor(remaining / 256);
  }
  for (let i = 6; i < 16; i++) bytes.push(Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function secondsBetween(min: number, max: number, rng: Rng): number {
  return Math.round((min + rng() * (max - min)) * 1000);
}

function buildVisitorEvents(
  visitor: PlannedVisitor,
  { appUrl, errorMessage, rng }: { appUrl: URL; errorMessage: string; rng: Rng }
): PostHogEvent[] {
  const start = visitor.timestamp.getTime();
  const distinctId = uuidv7(start, rng);
  const device = pickWeighted(DEVICES, rng);
  const signupUrl = new URL("/signup", appUrl);
  if (visitor.utmSource) signupUrl.searchParams.set("utm_source", visitor.utmSource);
  const referrer = (visitor.utmSource && REFERRERS[visitor.utmSource]) || "$direct";

  // Mirrors what posthog-js attaches in the browser, so these events read like the app's own.
  const common: Record<string, unknown> = {
    $lib: "web",
    $lib_version: posthogPackage.version,
    $browser: device.browser,
    $browser_version: device.browserVersion,
    $os: device.os,
    $os_version: device.osVersion,
    $device_type: device.deviceType,
    $raw_user_agent: device.userAgent,
    $browser_language: visitor.locale.locale,
    $browser_language_prefix: visitor.locale.language,
    $timezone: visitor.locale.timeZone,
    $host: appUrl.host,
    $device_id: distinctId,
    $session_id: uuidv7(start, rng),
    $window_id: uuidv7(start, rng),
    $process_person_profile: false,
    ...(visitor.utmSource ? { utm_source: visitor.utmSource } : {}),
  };
  const onSignupPage = {
    $current_url: signupUrl.toString(),
    $pathname: "/signup",
    $referrer: referrer,
    $referring_domain: referrer === "$direct" ? "$direct" : new URL(referrer).host,
  };
  const formProps = { has_token: false, is_premium_username: false };

  const clickedAt = start + secondsBetween(3, 15, rng);
  const submittedAt = clickedAt + secondsBetween(20, 60, rng);
  const resultAt = submittedAt + secondsBetween(1, 3, rng);

  const steps: [string, number, Record<string, unknown>][] = [
    ["$pageview", start, onSignupPage],
    ["signup_email_button_clicked", clickedAt, { ...onSignupPage, has_token: false }],
    ["signup_form_submitted", submittedAt, { ...onSignupPage, ...formProps, username_taken: false }],
  ];
  if (visitor.outcome === "success") {
    const successUrl = new URL(SUCCESS_PATH, appUrl);
    steps.push([
      "$pageview",
      resultAt,
      {
        $current_url: successUrl.toString(),
        $pathname: successUrl.pathname,
        $referrer: signupUrl.toString(),
        $referring_domain: appUrl.host,
      },
    ]);
  } else {
    const message = visitor.outcome === "taken" ? TAKEN_MESSAGE : errorMessage;
    steps.push([
      "signup_form_submit_error",
      resultAt,
      { ...onSignupPage, ...formProps, error_message: message },
    ]);
  }

  return steps.map(([event, time, properties]) => ({
    event,
    distinct_id: distinctId,
    timestamp: new Date(time).toISOString(),
    uuid: uuidv7(time, rng),
    properties: { ...common, ...properties },
  }));
}

async function sendBatches({
  host,
  apiKey,
  events,
  batchSize = 500,
  fetchImpl = fetch,
  requestTimeoutMs = 30_000,
  onBatch,
}: {
  host: string;
  apiKey: string;
  events: PostHogEvent[];
  batchSize?: number;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  onBatch?: (sent: number, total: number) => void;
}): Promise<void> {
  const endpoint = `${host.replace(/\/+$/, "")}/batch/`;
  const total = Math.ceil(events.length / batchSize);
  for (let index = 0; index < total; index++) {
    const batch = events.slice(index * batchSize, (index + 1) * batchSize);
    // One deadline covers the request and the reading of its answer, so a stalled response cannot hang the run.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // historical_migration routes past-dated events to PostHog's backfill pipeline.
        body: JSON.stringify({ api_key: apiKey, historical_migration: true, batch }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `PostHog rejected batch ${index + 1} of ${total} at ${endpoint}: HTTP ${response.status} ${detail}`
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      throw new Error(
        `PostHog did not answer batch ${index + 1} of ${total} at ${endpoint} within ${requestTimeoutMs} ms`
      );
    } finally {
      clearTimeout(timer);
    }
    onBatch?.(index + 1, total);
  }
}

function summarizeByDay(visitors: PlannedVisitor[]): Record<string, string | number>[] {
  const rows = new Map<string, Record<string, string | number>>();
  for (const visitor of visitors) {
    const day = visitor.timestamp.toISOString().slice(0, 10);
    let row = rows.get(day);
    if (!row) {
      row = { day, visitors: 0, signups: 0, "bug errors": 0, "other errors": 0 };
      for (const profile of LOCALES) row[`signups ${profile.language}`] = 0;
      rows.set(day, row);
    }
    row.visitors = Number(row.visitors) + 1;
    if (visitor.outcome === "success") {
      row.signups = Number(row.signups) + 1;
      const key = `signups ${visitor.locale.language}`;
      row[key] = Number(row[key]) + 1;
    } else {
      const key = visitor.outcome === "bug" ? "bug errors" : "other errors";
      row[key] = Number(row[key]) + 1;
    }
  }
  return Array.from(rows.values());
}

export { SUCCESS_PATH, MAX_VISIT_MS, buildVisitorEvents, sendBatches, summarizeByDay };
export type { PostHogEvent };
