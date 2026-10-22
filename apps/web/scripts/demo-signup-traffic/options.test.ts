import { describe, expect, it } from "vitest";
import { parseCommand, UsageError } from "./options";

const now = new Date("2026-10-22T12:00:00Z");
const env = {
  NEXT_PUBLIC_POSTHOG_KEY: "phc_env",
  NEXT_PUBLIC_WEBAPP_URL: "https://preview.example.com",
};

describe("parseCommand", () => {
  it("shows the help without a command", () => {
    expect(parseCommand([], env, now)).toEqual({ mode: "help" });
    expect(parseCommand(["--help"], env, now)).toEqual({ mode: "help" });
  });

  it("fills the backfill defaults from the environment", () => {
    const command = parseCommand(["backfill", "--seed", "9"], env, now);
    expect(command).toEqual({
      mode: "backfill",
      options: {
        url: new URL("https://preview.example.com"),
        apiKey: "phc_env",
        host: "https://eu.i.posthog.com",
        days: 14,
        perDay: 40,
        dropStart: new Date("2026-10-19T12:00:00Z"),
        dropPercent: 40,
        failingLanguages: new Set(["it", "es"]),
        errorMessage: "Internal server error",
        seed: 9,
        dryRun: false,
      },
    });
  });

  it("takes the drop flags", () => {
    const command = parseCommand(
      [
        "backfill",
        "--drop-start",
        "2026-10-21T08:30:00Z",
        "--drop-percent",
        "25",
        "--failing-languages",
        "DE",
      ],
      env,
      now
    );
    expect(command.mode === "backfill" && command.options).toMatchObject({
      dropStart: new Date("2026-10-21T08:30:00Z"),
      dropPercent: 25,
      failingLanguages: new Set(["de"]),
    });
  });

  it("reads the live flags", () => {
    const command = parseCommand(
      ["live", "--url", "https://cal.example.com", "--count", "3", "--linger-ms", "0"],
      { CHROME_PATH: "/opt/chrome" },
      now
    );
    expect(command.mode === "live" && command.options).toMatchObject({
      url: new URL("https://cal.example.com"),
      count: 3,
      lingerMs: 0,
      delayMs: 2000,
      emailDomain: "example.com",
      executablePath: "/opt/chrome",
      ignoreHttpsErrors: false,
      headed: false,
    });
  });

  it.each([
    [["deploy"], 'Unknown command "deploy"'],
    [["backfill"], "--key is required"],
    [["backfill", "--drop-percent", "140"], "--drop-percent must be a whole number from 0 to 100"],
    [["backfill", "--drop-start", "yesterday"], "--drop-start must be an ISO time"],
    [["backfill", "--failing-languages", "it,fr"], "unknown languages: fr"],
    [["backfill", "--unknown"], "Unknown option '--unknown'"],
    [["live", "--count", "2"], "--url is required"],
    [["live", "--url", "cal.example.com", "--count", "2"], "--url must be a full URL"],
    [["live", "--url", "https://cal.example.com"], "--count is required"],
    [
      ["live", "--url", "https://cal.example.com", "--count", "2", "--dry-run"],
      "--dry-run works only with backfill",
    ],
    [["backfill", "--count", "2"], "--count works only with live"],
  ])("rejects %j", (argv, message) => {
    const environment = argv[0] === "backfill" && argv.length === 1 ? {} : env;
    const run = () => parseCommand(argv, environment, now);
    expect(run).toThrow(UsageError);
    expect(run).toThrow(message);
  });
});
