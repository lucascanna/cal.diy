import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIs24hClockFromLocalStorage, isBrowserLocale24h, TimeFormat } from "./timeFormat";

const RealDateTimeFormat: Intl.DateTimeFormatConstructor = Intl.DateTimeFormat;
const IS_24H_STORAGE_KEY = "timeOption.is24hClock";

// The app asks for the browser locale by passing `undefined` to Intl.DateTimeFormat.
// Pinning that default to one locale keeps the real ICU data the browser would use.
function mockBrowserLocale(locale: string): MockInstance<Intl.DateTimeFormatConstructor> {
  return vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    _locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    return new RealDateTimeFormat(locale, options);
  });
}

// Simulates engines whose resolvedOptions() omits fields, to exercise the fallbacks.
function mockBrowserLocaleWithResolvedOptions(
  locale: string,
  { hourCycle, hour12 }: Pick<Intl.ResolvedDateTimeFormatOptions, "hourCycle" | "hour12">
): void {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    _locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    const formatter = new RealDateTimeFormat(locale, options);
    const resolved = formatter.resolvedOptions();
    vi.spyOn(formatter, "resolvedOptions").mockReturnValue({ ...resolved, hourCycle, hour12 });
    return formatter;
  });
}

describe("isBrowserLocale24h", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("without a saved preference", () => {
    it.each([
      { locale: "en-US", is24h: false },
      { locale: "de-DE", is24h: true },
      { locale: "en-GB", is24h: true },
      { locale: "ja-JP", is24h: true },
      // These 12h locales write the day period in their own script ("12 ص", "12 π.μ.",
      // "上午12時", "오전 12시"), so the output never contains a Latin "M".
      { locale: "ar", is24h: false },
      { locale: "ar-EG", is24h: false },
      { locale: "el", is24h: false },
      { locale: "zh-TW", is24h: false },
      { locale: "ko-KR", is24h: false },
    ])("detects $locale as is24h=$is24h and saves it", ({ locale, is24h }) => {
      mockBrowserLocale(locale);

      expect(isBrowserLocale24h()).toBe(is24h);
      expect(getIs24hClockFromLocalStorage()).toBe(is24h);
    });
  });

  describe("with a saved preference", () => {
    it.each([
      { saved: "true", locale: "en-US", is24h: true },
      { saved: "false", locale: "de-DE", is24h: false },
      { saved: "false", locale: "zh-TW", is24h: false },
    ])("returns the saved choice ($saved) for $locale without detecting", ({ saved, locale, is24h }) => {
      window.localStorage.setItem(IS_24H_STORAGE_KEY, saved);
      const dateTimeFormatSpy = mockBrowserLocale(locale);

      expect(isBrowserLocale24h()).toBe(is24h);
      expect(dateTimeFormatSpy).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(IS_24H_STORAGE_KEY)).toBe(saved);
    });
  });

  describe("when Intl does not report every option", () => {
    // zh-TW has no Latin "M" and en-US has one, so these cases fail if the AM/PM marker is used instead.
    it.each([
      { locale: "zh-TW", hour12: true, is24h: false },
      { locale: "en-US", hour12: false, is24h: true },
    ])("uses hour12=$hour12 for $locale when hourCycle is missing", ({ locale, hour12, is24h }) => {
      mockBrowserLocaleWithResolvedOptions(locale, { hourCycle: undefined, hour12 });

      expect(isBrowserLocale24h()).toBe(is24h);
    });

    it.each([
      { locale: "en-US", is24h: false },
      { locale: "en-GB", is24h: true },
    ])("falls back to the AM/PM marker for $locale when hourCycle and hour12 are missing", ({
      locale,
      is24h,
    }) => {
      mockBrowserLocaleWithResolvedOptions(locale, { hourCycle: undefined, hour12: undefined });

      expect(isBrowserLocale24h()).toBe(is24h);
    });
  });
});

describe("detectBrowserTimeFormat", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { locale: "en-US", timeFormat: TimeFormat.TWELVE_HOUR },
    { locale: "de-DE", timeFormat: TimeFormat.TWENTY_FOUR_HOUR },
    { locale: "ar", timeFormat: TimeFormat.TWELVE_HOUR },
    { locale: "el", timeFormat: TimeFormat.TWELVE_HOUR },
    { locale: "zh-TW", timeFormat: TimeFormat.TWELVE_HOUR },
    { locale: "ko-KR", timeFormat: TimeFormat.TWELVE_HOUR },
  ])("resolves $locale to $timeFormat when the module loads", async ({ locale, timeFormat }) => {
    mockBrowserLocale(locale);

    const { detectBrowserTimeFormat } = await import("./timeFormat");

    expect(detectBrowserTimeFormat).toBe(timeFormat);
  });
});
