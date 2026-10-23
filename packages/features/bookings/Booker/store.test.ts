// @vitest-environment jsdom
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookerStore } from "./store";

const BOOKER_PATH = "/pro/30min";

const openBookerUrl = (search: string): void => {
  window.history.replaceState(null, "", `${BOOKER_PATH}${search}`);
};

const initializeStore = (
  store: ReturnType<typeof createBookerStore>,
  extra: { month?: string } = {}
): void => {
  store.getState().initialize({
    username: "pro",
    eventSlug: "30min",
    eventId: 1,
    layout: BookerLayouts.MONTH_VIEW,
    ...extra,
  });
};

const searchParams = (): URLSearchParams => new URLSearchParams(window.location.search);

describe("createBookerStore month and date query params", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("keeps a valid future month and date", () => {
    openBookerUrl("?layout=month_view&month=2026-12&date=2026-12-03");
    const store = createBookerStore();

    expect(store.getState().month).toBe("2026-12");
    expect(store.getState().selectedDate).toBe("2026-12-03");

    initializeStore(store);
    expect(searchParams().get("month")).toBe("2026-12");
    expect(searchParams().get("date")).toBe("2026-12-03");
  });

  it("takes the month from a valid date when month is missing", () => {
    openBookerUrl("?date=2026-11-05");
    const store = createBookerStore();

    expect(store.getState().month).toBe("2026-11");
    expect(store.getState().selectedDate).toBe("2026-11-05");
  });

  it.each([
    "garbage",
    "2026-13",
    "2020-01",
  ])("falls back to the current month and removes month=%s from the URL", (month) => {
    openBookerUrl(`?layout=month_view&month=${month}`);
    const store = createBookerStore();

    expect(store.getState().month).toBe("2026-10");

    initializeStore(store);
    expect(store.getState().month).toBe("2026-10");
    expect(searchParams().has("month")).toBe(false);
    expect(searchParams().get("layout")).toBe("month_view");
  });

  it.each([
    "garbage",
    "2026-02-31",
    "2026-10-19",
  ])("selects no date and removes date=%s from the URL", (date) => {
    openBookerUrl(`?layout=month_view&date=${date}`);
    const store = createBookerStore();

    expect(store.getState().selectedDate).toBeNull();
    expect(store.getState().month).toBe("2026-10");

    initializeStore(store);
    expect(store.getState().selectedDate).toBeNull();
    expect(searchParams().has("date")).toBe(false);
  });

  it("keeps a valid month when only the date is invalid", () => {
    openBookerUrl("?month=2026-11&date=garbage");
    const store = createBookerStore();

    expect(store.getState().month).toBe("2026-11");
    expect(store.getState().selectedDate).toBeNull();

    initializeStore(store);
    expect(searchParams().get("month")).toBe("2026-11");
    expect(searchParams().has("date")).toBe(false);
  });

  it("ignores an invalid month prop and keeps a valid one", () => {
    openBookerUrl("");
    const store = createBookerStore();

    initializeStore(store, { month: "garbage" });
    expect(store.getState().month).toBe("2026-10");

    initializeStore(store, { month: "2027-02" });
    expect(store.getState().month).toBe("2027-02");
  });

  it("leaves the URL alone on platform when URL updates are not allowed", () => {
    openBookerUrl("?month=garbage&date=garbage");
    const store = createBookerStore();

    store.getState().initialize({
      username: "pro",
      eventSlug: "30min",
      eventId: 1,
      layout: BookerLayouts.MONTH_VIEW,
      isPlatform: true,
      allowUpdatingUrlParams: false,
    });

    expect(store.getState().month).toBe("2026-10");
    expect(store.getState().selectedDate).toBeNull();
    expect(searchParams().get("month")).toBe("garbage");
    expect(searchParams().get("date")).toBe("garbage");
  });
});
