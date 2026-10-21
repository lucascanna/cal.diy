import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMock);
vi.mock("posthog-js", () => ({ default: posthogMock }));
vi.mock("botid/client/core", () => ({ initBotId: vi.fn() }));

const CLIENT_DSN = "https://public@o1.ingest.de.sentry.io/2";
const POSTHOG_KEY = "phc_test_key";
const POSTHOG_HOST = "https://eu.i.posthog.com";

async function loadInstrumentationClient() {
  return import("./instrumentation-client");
}

describe("instrumentation-client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN_CLIENT", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Sentry", () => {
    it("starts Sentry in development when the client DSN is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN_CLIENT", CLIENT_DSN);

      await loadInstrumentationClient();

      expect(sentryMock.init).toHaveBeenCalledTimes(1);
      expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: CLIENT_DSN }));
    });

    it("does not start Sentry when the client DSN is not set, even in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await loadInstrumentationClient();

      expect(sentryMock.init).not.toHaveBeenCalled();
    });

    it("captures router transitions only when the client DSN is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN_CLIENT", CLIENT_DSN);
      const withDsn = await loadInstrumentationClient();
      withDsn.onRouterTransitionStart("/bookings", "push");
      expect(sentryMock.captureRouterTransitionStart).toHaveBeenCalledWith("/bookings", "push");

      vi.resetModules();
      vi.clearAllMocks();
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN_CLIENT", "");
      const withoutDsn = await loadInstrumentationClient();
      withoutDsn.onRouterTransitionStart("/bookings", "push");
      expect(sentryMock.captureRouterTransitionStart).not.toHaveBeenCalled();
    });
  });

  describe("PostHog", () => {
    it("initializes PostHog with the configured host when the key is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", POSTHOG_KEY);
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", POSTHOG_HOST);

      await loadInstrumentationClient();

      expect(posthogMock.init).toHaveBeenCalledTimes(1);
      expect(posthogMock.init).toHaveBeenCalledWith(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        defaults: "2025-05-24",
      });
    });

    it("keeps the PostHog default host when no host is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", POSTHOG_KEY);

      await loadInstrumentationClient();

      expect(posthogMock.init).toHaveBeenCalledWith(POSTHOG_KEY, { defaults: "2025-05-24" });
    });

    it("does not initialize PostHog when the key is not set", async () => {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", POSTHOG_HOST);

      await loadInstrumentationClient();

      expect(posthogMock.init).not.toHaveBeenCalled();
    });
  });
});
