import { describe, expect, it } from "vitest";
import { parseDateParam, parseMonthParam } from "./parseBookerDateParams";

// Local time, so the test matches the browser-local "today" the helper uses in any TZ.
const NOW: Date = new Date(2026, 9, 20, 12, 0, 0);

describe("parseMonthParam", () => {
  it("returns the current month", () => {
    expect(parseMonthParam("2026-10", NOW)).toBe("2026-10");
  });

  it("returns a future month", () => {
    expect(parseMonthParam("2026-12", NOW)).toBe("2026-12");
    expect(parseMonthParam("2027-01", NOW)).toBe("2027-01");
  });

  it.each([null, undefined, ""])("returns null for an empty value (%s)", (value) => {
    expect(parseMonthParam(value, NOW)).toBeNull();
  });

  it.each([
    "garbage",
    "2026-13",
    "2026-00",
    "2026-1",
    "26-10",
    "2026-10-01",
    " 2026-10",
    "2026-10 ",
    "2026/10",
  ])("returns null for a malformed month (%s)", (value) => {
    expect(parseMonthParam(value, NOW)).toBeNull();
  });

  it("returns null for a past month", () => {
    expect(parseMonthParam("2026-09", NOW)).toBeNull();
    expect(parseMonthParam("2020-01", NOW)).toBeNull();
  });

  it("uses the local month of now at a month boundary", () => {
    const lastMomentOfOctober = new Date(2026, 9, 31, 23, 59, 59);
    expect(parseMonthParam("2026-10", lastMomentOfOctober)).toBe("2026-10");

    const firstMomentOfNovember = new Date(2026, 10, 1, 0, 0, 0);
    expect(parseMonthParam("2026-10", firstMomentOfNovember)).toBeNull();
    expect(parseMonthParam("2026-11", firstMomentOfNovember)).toBe("2026-11");
  });
});

describe("parseDateParam", () => {
  it("returns today", () => {
    expect(parseDateParam("2026-10-20", NOW)).toBe("2026-10-20");
  });

  it("returns a future date", () => {
    expect(parseDateParam("2026-10-21", NOW)).toBe("2026-10-21");
    expect(parseDateParam("2028-02-29", NOW)).toBe("2028-02-29");
  });

  it.each([null, undefined, ""])("returns null for an empty value (%s)", (value) => {
    expect(parseDateParam(value, NOW)).toBeNull();
  });

  it.each([
    "garbage",
    "2026-10",
    "2026-1-21",
    "2026-10-21T10:00",
    "21-10-2026",
    "2026/10/21",
  ])("returns null for a malformed date (%s)", (value) => {
    expect(parseDateParam(value, NOW)).toBeNull();
  });

  it.each([
    "2027-02-31",
    "2027-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-00-10",
    "2026-12-00",
    "2026-12-32",
  ])("returns null for a date that does not exist (%s)", (value) => {
    expect(parseDateParam(value, NOW)).toBeNull();
  });

  it("returns null for a past date", () => {
    expect(parseDateParam("2026-10-19", NOW)).toBeNull();
    expect(parseDateParam("2026-02-28", NOW)).toBeNull();
  });
});
