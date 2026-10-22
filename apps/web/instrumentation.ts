//biome-ignore-all lint/correctness/noProcessGlobal: Runs on both the Node.js and the edge runtime
//biome-ignore-all lint/style/noProcessEnv: Runs on both the Node.js and the edge runtime
import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

// The DSN is the switch, not NODE_ENV: preview environments run `next dev` and still need error reporting.
export async function register(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureRequestError(err, request, context);
  }
};
