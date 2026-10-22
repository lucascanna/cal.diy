/**
 * Demo traffic for the signup funnel: a PostHog history with a signup drop, and live signups on an app URL.
 * Run by hand only: `yarn workspace @calcom/web demo:signup-traffic --help`.
 */

import process from "node:process";
import type { BackfillOptions, LiveOptions } from "./options";
import { parseCommand, USAGE, UsageError } from "./options";
import { buildVisitorEvents, MAX_VISIT_MS, sendBatches, summarizeByDay } from "./posthog-backfill";
import { createRng, failureRate, LOCALES, planBackfill } from "./traffic-model";

async function backfill(options: BackfillOptions, now: Date): Promise<void> {
  const languages = Array.from(options.failingLanguages).join(",");
  const { rate, capped } = failureRate(options.dropPercent, options.failingLanguages);
  if (capped) {
    console.warn(
      `Warning: "${languages}" is too small a share of the traffic for a ${options.dropPercent}% drop. Every visitor in those languages fails after the drop start.`
    );
  }

  const rng = createRng(options.seed);
  const visitors = planBackfill({
    end: new Date(now.getTime() - MAX_VISIT_MS),
    days: options.days,
    perDay: options.perDay,
    dropStart: options.dropStart,
    failingLanguages: options.failingLanguages,
    bugRate: rate,
    rng,
  });
  const events = visitors.flatMap((visitor) =>
    buildVisitorEvents(visitor, { appUrl: options.url, errorMessage: options.errorMessage, rng })
  );
  const bugVisitors = visitors.filter((visitor) => visitor.outcome === "bug");
  const bugFromReddit = bugVisitors.filter((visitor) => visitor.utmSource === "reddit").length;

  console.table(summarizeByDay(visitors));
  console.log(
    [
      `Seed ${options.seed}: ${visitors.length} visitors, ${events.length} events for ${options.url.origin}.`,
      `Drop from ${options.dropStart.toISOString()}: ${languages || "no language"} fail at ${Math.round(rate * 100)}%, "${options.errorMessage}".`,
      `Bug errors: ${bugVisitors.length}, ${bugFromReddit} of them with utm_source=reddit.`,
    ].join("\n")
  );

  if (options.dryRun) {
    console.log("Dry run: nothing was sent.");
    return;
  }
  await sendBatches({
    host: options.host,
    apiKey: options.apiKey,
    events,
    onBatch: (sent, total) => console.log(`Sent batch ${sent} of ${total}`),
  });
  console.log(
    `Sent ${events.length} events to ${options.host}. PostHog can take a few minutes to show them.`
  );
}

async function live(options: LiveOptions): Promise<void> {
  // Loaded here so a backfill does not need a browser.
  const { runLiveSignups } = await import("./live-signups");
  console.log(`Seed ${options.seed}: ${options.count} signups on ${options.url.origin}.`);
  const results = await runLiveSignups(options, console.log);

  console.table(
    LOCALES.map(({ locale }) => {
      const forLocale = results.filter((result) => result.locale === locale);
      return {
        locale,
        "signed up": forLocale.filter((result) => result.outcome === "signed-up").length,
        "app errors": forLocale.filter((result) => result.outcome === "app-error").length,
        "no result": forLocale.filter((result) => result.outcome === "no-result").length,
      };
    })
  );
  const posthogRequests = results.reduce((sum, result) => sum + result.posthogRequests, 0);
  if (posthogRequests === 0) {
    console.warn("Warning: no PostHog request left the browser. Check NEXT_PUBLIC_POSTHOG_KEY on the app.");
  }
  if (results.some((result) => result.outcome === "no-result")) process.exitCode = 1;
}

async function main(): Promise<void> {
  const now = new Date();
  const command = parseCommand(process.argv.slice(2), process.env, now);
  if (command.mode === "help") {
    console.log(USAGE);
    return;
  }
  if (command.mode === "backfill") {
    await backfill(command.options, now);
    return;
  }
  await live(command.options);
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
