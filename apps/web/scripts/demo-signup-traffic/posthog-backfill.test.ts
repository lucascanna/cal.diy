import { describe, expect, it, vi } from "vitest";
import { buildVisitorEvents, MAX_VISIT_MS, sendBatches, summarizeByDay } from "./posthog-backfill";
import type { PlannedVisitor } from "./traffic-model";
import { createRng, LOCALES } from "./traffic-model";

const appUrl = new URL("https://cal.example.com");
const italian = LOCALES[1];
const english = LOCALES[0];

function visitor(overrides: Partial<PlannedVisitor> = {}): PlannedVisitor {
  return {
    timestamp: new Date("2026-10-20T10:00:00Z"),
    locale: italian,
    utmSource: "reddit",
    outcome: "success",
    ...overrides,
  };
}

describe("buildVisitorEvents", () => {
  it("sends the app's signup funnel and lands on the verify-email page", () => {
    const events = buildVisitorEvents(visitor(), { appUrl, errorMessage: "boom", rng: createRng(1) });

    expect(events.map((event) => event.event)).toEqual([
      "$pageview",
      "signup_email_button_clicked",
      "signup_form_submitted",
      "$pageview",
    ]);
    expect(events[0].properties).toMatchObject({
      $current_url: "https://cal.example.com/signup?utm_source=reddit",
      $pathname: "/signup",
      $browser_language: "it-IT",
      $browser_language_prefix: "it",
      utm_source: "reddit",
      $referring_domain: "www.reddit.com",
      $lib: "web",
    });
    expect(events[3].properties.$current_url).toBe("https://cal.example.com/auth/verify-email?from=signup");
    expect(new Set(events.map((event) => event.distinct_id)).size).toBe(1);
    expect(new Set(events.map((event) => event.uuid)).size).toBe(4);
  });

  it("keeps the visit in order and inside the visit window", () => {
    const events = buildVisitorEvents(visitor(), { appUrl, errorMessage: "boom", rng: createRng(2) });
    const times = events.map((event) => Date.parse(event.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[3] - times[0]).toBeLessThanOrEqual(MAX_VISIT_MS);
  });

  it("ends a planted-bug visit with signup_form_submit_error and the given message", () => {
    const events = buildVisitorEvents(visitor({ outcome: "bug" }), {
      appUrl,
      errorMessage: "Internal server error",
      rng: createRng(3),
    });
    expect(events[3]).toMatchObject({
      event: "signup_form_submit_error",
      properties: { error_message: "Internal server error", has_token: false, $browser_language: "it-IT" },
    });
  });

  it("uses the taken message for a baseline error and no UTM for a direct visit", () => {
    const events = buildVisitorEvents(visitor({ outcome: "taken", utmSource: null, locale: english }), {
      appUrl,
      errorMessage: "Internal server error",
      rng: createRng(4),
    });
    expect(events[3].properties.error_message).toBe("Username or email is already taken");
    expect(events[0].properties.$current_url).toBe("https://cal.example.com/signup");
    expect(events[0].properties).not.toHaveProperty("utm_source");
    expect(events[0].properties.$referrer).toBe("$direct");
  });
});

describe("sendBatches", () => {
  const events = buildVisitorEvents(visitor(), { appUrl, errorMessage: "boom", rng: createRng(5) });

  it("posts batches to /batch/ as a historical migration", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const onBatch = vi.fn();
    await sendBatches({
      host: "https://eu.i.posthog.com/",
      apiKey: "phc_test",
      events,
      batchSize: 3,
      fetchImpl,
      onBatch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [endpoint, init] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe("https://eu.i.posthog.com/batch/");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ api_key: "phc_test", historical_migration: true });
    expect(body.batch).toHaveLength(3);
    expect(onBatch).toHaveBeenLastCalledWith(2, 2);
  });

  it("stops with the status and the answer when PostHog rejects a batch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
    await expect(
      sendBatches({ host: "https://eu.i.posthog.com", apiKey: "bad", events, fetchImpl })
    ).rejects.toThrow(
      "PostHog rejected batch 1 of 1 at https://eu.i.posthog.com/batch/: HTTP 401 invalid key"
    );
  });
});

describe("summarizeByDay", () => {
  it("counts visitors, signups and errors per day and language", () => {
    const rows = summarizeByDay([
      visitor(),
      visitor({ outcome: "bug" }),
      visitor({ outcome: "taken", locale: english }),
      visitor({ timestamp: new Date("2026-10-21T09:00:00Z"), locale: english }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        day: "2026-10-20",
        visitors: 3,
        signups: 1,
        "bug errors": 1,
        "other errors": 1,
        "signups it": 1,
      }),
      expect.objectContaining({ day: "2026-10-21", visitors: 1, signups: 1, "signups en": 1 }),
    ]);
  });
});
