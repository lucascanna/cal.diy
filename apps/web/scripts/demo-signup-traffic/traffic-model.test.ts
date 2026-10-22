import { describe, expect, it } from "vitest";
import {
  createFakeUser,
  createRng,
  failureRate,
  LOCALES,
  type PlannedVisitor,
  pickUtmSource,
  pickWeighted,
  planBackfill,
} from "./traffic-model";

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILING = new Set(["it", "es"]);

function successRate(visitors: PlannedVisitor[]): number {
  return visitors.filter((visitor) => visitor.outcome === "success").length / visitors.length;
}

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = createRng(7);
    const second = createRng(7);
    const values = Array.from({ length: 5 }, () => first());
    expect(Array.from({ length: 5 }, () => second())).toEqual(values);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe("pickWeighted", () => {
  it("follows the weights", () => {
    const rng = createRng(1);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const { language } = pickWeighted(LOCALES, rng);
      counts[language] = (counts[language] ?? 0) + 1;
    }
    expect(counts.en / 10_000).toBeCloseTo(0.4, 1);
    expect(counts.it / 10_000).toBeCloseTo(0.2, 1);
  });
});

describe("pickUtmSource", () => {
  it("sends most failing-language visitors from reddit and few others", () => {
    const rng = createRng(2);
    const share = (language: string) =>
      Array.from({ length: 5000 }, () => pickUtmSource(language, FAILING, rng)).filter(
        (source) => source === "reddit"
      ).length / 5000;
    expect(share("it")).toBeCloseTo(0.7, 1);
    expect(share("en")).toBeCloseTo(0.1, 1);
  });
});

describe("failureRate", () => {
  it("fails every it and es visitor for a 40% drop", () => {
    expect(failureRate(40, FAILING)).toEqual({ rate: 1, capped: false });
  });

  it("scales down for a smaller drop", () => {
    expect(failureRate(20, FAILING).rate).toBeCloseTo(0.5);
  });

  it("caps at 100% when the languages are too small a share", () => {
    expect(failureRate(60, FAILING)).toEqual({ rate: 1, capped: true });
    expect(failureRate(10, new Set())).toEqual({ rate: 0, capped: true });
  });
});

describe("planBackfill", () => {
  const end = new Date("2026-10-22T18:00:00Z");
  const dropStart = new Date(end.getTime() - 3 * DAY_MS);
  const visitors = planBackfill({
    end,
    days: 14,
    perDay: 2000,
    dropStart,
    failingLanguages: FAILING,
    bugRate: failureRate(40, FAILING).rate,
    rng: createRng(3),
  });
  const before = visitors.filter((visitor) => visitor.timestamp < dropStart);
  const after = visitors.filter((visitor) => visitor.timestamp >= dropStart);

  it("covers 14 days, in order, and never passes the end", () => {
    const days = new Set(visitors.map((visitor) => visitor.timestamp.toISOString().slice(0, 10)));
    expect(days.size).toBe(14);
    expect(visitors.at(-1)?.timestamp.getTime()).toBeLessThanOrEqual(end.getTime());
    const times = visitors.map((visitor) => visitor.timestamp.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("has no bug errors before the drop start", () => {
    expect(before.some((visitor) => visitor.outcome === "bug")).toBe(false);
  });

  it("breaks only the failing languages after the drop start", () => {
    const bug = after.filter((visitor) => visitor.outcome === "bug");
    expect(bug.length).toBeGreaterThan(0);
    expect(bug.every((visitor) => FAILING.has(visitor.locale.language))).toBe(true);
    const steady = (list: PlannedVisitor[]) =>
      successRate(list.filter((v) => !FAILING.has(v.locale.language)));
    expect(steady(after)).toBeCloseTo(steady(before), 1);
  });

  it("drops successful signups by about 40% and mostly from reddit", () => {
    expect(1 - successRate(after) / successRate(before)).toBeCloseTo(0.4, 1);
    const bug = after.filter((visitor) => visitor.outcome === "bug");
    const reddit = bug.filter((visitor) => visitor.utmSource === "reddit").length;
    expect(reddit / bug.length).toBeGreaterThan(0.6);
  });
});

describe("createFakeUser", () => {
  it("builds an ASCII username, an email on the domain and a valid password", () => {
    const user = createFakeUser("es", "demo.test", createRng(4));
    expect(user.username).toMatch(/^[a-z]+\d{4}$/);
    expect(user.email).toMatch(/^[a-z]+\.[a-z]+\d{4}@demo\.test$/);
    expect(user.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{7,}$/);
  });
});
