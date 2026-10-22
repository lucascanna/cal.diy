import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  prismaIntegration: vi.fn(() => ({ name: "Prisma" })),
  httpIntegration: vi.fn(() => ({ name: "Http" })),
}));

vi.mock("@sentry/nextjs", () => sentryMock);

const SERVER_DSN = "https://public@o1.ingest.de.sentry.io/1";

async function loadInstrumentation() {
  return import("./instrumentation");
}

describe("instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("register", () => {
    it("starts the server Sentry config in development when the DSN is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", SERVER_DSN);
      vi.stubEnv("NEXT_RUNTIME", "nodejs");

      const { register } = await loadInstrumentation();
      await register();

      expect(sentryMock.init).toHaveBeenCalledTimes(1);
      expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: SERVER_DSN }));
      expect(sentryMock.prismaIntegration).toHaveBeenCalled();
    });

    it("starts the edge Sentry config on the edge runtime when the DSN is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", SERVER_DSN);
      vi.stubEnv("NEXT_RUNTIME", "edge");

      const { register } = await loadInstrumentation();
      await register();

      expect(sentryMock.init).toHaveBeenCalledTimes(1);
      expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: SERVER_DSN }));
      expect(sentryMock.prismaIntegration).not.toHaveBeenCalled();
    });

    it("does not start Sentry when the DSN is not set, even in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");

      const { register } = await loadInstrumentation();
      await register();

      expect(sentryMock.init).not.toHaveBeenCalled();
    });
  });

  describe("onRequestError", () => {
    const error = new Error("boom");
    const request = { path: "/api/test", method: "GET", headers: {} };
    const context = {
      routerKind: "App Router",
      routePath: "/api/test",
      routeType: "route",
      renderSource: undefined,
      revalidateReason: undefined,
      renderType: undefined,
    } as const;

    it("reports the request error when the DSN is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", SERVER_DSN);

      const { onRequestError } = await loadInstrumentation();
      await onRequestError(error, request, context);

      expect(sentryMock.captureRequestError).toHaveBeenCalledWith(error, request, context);
    });

    it("does not report the request error when the DSN is not set", async () => {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

      const { onRequestError } = await loadInstrumentation();
      await onRequestError(error, request, context);

      expect(sentryMock.captureRequestError).not.toHaveBeenCalled();
    });
  });
});
