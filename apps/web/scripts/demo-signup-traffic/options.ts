import { parseArgs } from "node:util";
import { SUPPORTED_LANGUAGES } from "./traffic-model";

class UsageError extends Error {}

type BackfillOptions = {
  url: URL;
  apiKey: string;
  host: string;
  days: number;
  perDay: number;
  dropStart: Date;
  dropPercent: number;
  failingLanguages: Set<string>;
  errorMessage: string;
  seed: number;
  dryRun: boolean;
};

type LiveOptions = {
  url: URL;
  count: number;
  failingLanguages: Set<string>;
  emailDomain: string;
  delayMs: number;
  lingerMs: number;
  executablePath?: string;
  ignoreHttpsErrors: boolean;
  headed: boolean;
  seed: number;
};

type ParsedCommand =
  | { mode: "help" }
  | { mode: "backfill"; options: BackfillOptions }
  | { mode: "live"; options: LiveOptions };

const USAGE = `Usage: yarn workspace @calcom/web demo:signup-traffic <backfill|live> [flags]

backfill  Send past signup events to PostHog, with a signup drop near the end.
  --url <url>                 App URL in the events (default: NEXT_PUBLIC_WEBAPP_URL)
  --key <key>                 PostHog project key (default: NEXT_PUBLIC_POSTHOG_KEY)
  --host <url>                PostHog host (default: NEXT_PUBLIC_POSTHOG_HOST, then https://eu.i.posthog.com)
  --days <n>                  Days of history, today included (default: 14)
  --per-day <n>               Form submits on a weekday (default: 40)
  --drop-start <iso time>     When the planted bug starts (default: 3 days ago)
  --drop-percent <0-100>      Total drop of successful signups (default: 40)
  --failing-languages <list>  Languages the bug breaks (default: it,es)
  --error-message <text>      error_message of the bug's errors (default: "Internal server error")
  --seed <n>                  Seed for a reproducible run
  --dry-run                   Print the plan and send nothing

live      Sign up fake users on the app with a headless browser.
  --url <url>                 App URL (required)
  --count <n>                 Number of signups (required)
  --failing-languages <list>  Languages that mostly come from utm_source=reddit (default: it,es)
  --email-domain <domain>     Domain of the fake emails (default: example.com)
  --delay-ms <n>              Pause between two signups (default: 2000)
  --linger-ms <n>             Time on the result page, so PostHog can flush (default: 4000)
  --executable-path <path>    Chrome binary (default: CHROME_PATH, then Playwright's Chromium)
  --ignore-https-errors       Accept the certificate of a local proxy, as in a Kosuke sandbox
  --headed                    Show the browser
  --seed <n>                  Seed for a reproducible run`;

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAGS_BY_MODE = {
  backfill: ["key", "host", "days", "per-day", "drop-start", "drop-percent", "error-message", "dry-run"],
  live: [
    "count",
    "email-domain",
    "delay-ms",
    "linger-ms",
    "executable-path",
    "ignore-https-errors",
    "headed",
  ],
};

function toInteger(name: string, value: string | undefined, fallback: number, min: number, max?: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const range = max === undefined ? `${min} or more` : `${min} to ${max}`;
    throw new UsageError(`--${name} must be a whole number from ${range}, got "${value}"`);
  }
  return parsed;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new UsageError(`--${name} is required`);
  return value;
}

function toUrl(name: string, value: string | undefined): URL {
  const required = requireValue(name, value);
  try {
    return new URL(required);
  } catch {
    throw new UsageError(`--${name} must be a full URL such as https://example.com, got "${required}"`);
  }
}

function toLanguages(value: string | undefined): Set<string> {
  const languages = (value ?? "it,es")
    .split(",")
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean);
  const unknown = languages.filter((language) => !SUPPORTED_LANGUAGES.includes(language));
  if (unknown.length > 0) {
    throw new UsageError(
      `--failing-languages has unknown languages: ${unknown.join(", ")}. Use ${SUPPORTED_LANGUAGES.join(", ")}`
    );
  }
  return new Set(languages);
}

function toSeed(value: string | undefined, now: Date): number {
  return toInteger("seed", value, now.getTime() % 2 ** 32, 0, 2 ** 32 - 1);
}

function parseCommand(argv: string[], env: Record<string, string | undefined>, now: Date): ParsedCommand {
  const [mode, ...rest] = argv;
  if (!mode || mode === "help" || mode === "--help" || mode === "-h") return { mode: "help" };
  if (mode !== "backfill" && mode !== "live") {
    throw new UsageError(`Unknown command "${mode}". Use backfill or live`);
  }

  let parsed: ReturnType<typeof parseFlags>;
  try {
    parsed = parseFlags(rest);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values } = parsed;
  const otherMode = mode === "live" ? "backfill" : "live";
  const misplaced = FLAGS_BY_MODE[otherMode].find((flag) => flag in values);
  if (misplaced) throw new UsageError(`--${misplaced} works only with ${otherMode}`);
  const failingLanguages = toLanguages(values["failing-languages"]);
  const seed = toSeed(values.seed, now);

  if (mode === "live") {
    return {
      mode,
      options: {
        url: toUrl("url", values.url),
        count: toInteger("count", requireValue("count", values.count), 0, 1),
        failingLanguages,
        emailDomain: values["email-domain"] ?? "example.com",
        delayMs: toInteger("delay-ms", values["delay-ms"], 2000, 0),
        lingerMs: toInteger("linger-ms", values["linger-ms"], 4000, 0),
        executablePath: values["executable-path"] ?? env.CHROME_PATH,
        ignoreHttpsErrors: values["ignore-https-errors"] ?? false,
        headed: values.headed ?? false,
        seed,
      },
    };
  }

  const apiKey = values.key ?? env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) throw new UsageError("--key is required when NEXT_PUBLIC_POSTHOG_KEY is not set");
  const dropStart = values["drop-start"]
    ? new Date(values["drop-start"])
    : new Date(now.getTime() - 3 * DAY_MS);
  if (Number.isNaN(dropStart.getTime())) {
    throw new UsageError(
      `--drop-start must be an ISO time such as 2026-10-20T14:00:00Z, got "${values["drop-start"]}"`
    );
  }

  return {
    mode,
    options: {
      url: toUrl("url", values.url ?? env.NEXT_PUBLIC_WEBAPP_URL),
      apiKey,
      host: values.host ?? env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      days: toInteger("days", values.days, 14, 1, 365),
      perDay: toInteger("per-day", values["per-day"], 40, 1, 10_000),
      dropStart,
      dropPercent: toInteger("drop-percent", values["drop-percent"], 40, 0, 100),
      failingLanguages,
      errorMessage: values["error-message"] ?? "Internal server error",
      seed,
      dryRun: values["dry-run"] ?? false,
    },
  };
}

function parseFlags(args: string[]) {
  return parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      url: { type: "string" },
      key: { type: "string" },
      host: { type: "string" },
      days: { type: "string" },
      "per-day": { type: "string" },
      "drop-start": { type: "string" },
      "drop-percent": { type: "string" },
      "failing-languages": { type: "string" },
      "error-message": { type: "string" },
      seed: { type: "string" },
      "dry-run": { type: "boolean" },
      count: { type: "string" },
      "email-domain": { type: "string" },
      "delay-ms": { type: "string" },
      "linger-ms": { type: "string" },
      "executable-path": { type: "string" },
      "ignore-https-errors": { type: "boolean" },
      headed: { type: "boolean" },
    },
  });
}

export { UsageError, USAGE, parseCommand };
export type { BackfillOptions, LiveOptions, ParsedCommand };
