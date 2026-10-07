/*
 * Detects navigator locale 24h time preference
 * It works by reading the hour cycle Intl resolves for the user's preferred language
 * (h23/h24 = 24h, h11/h12 = 12h), falling back to hour12 and then to checking
 * whether hour output contains AM ('1 AM' or '01 h') on engines that report neither
 */
import { localStorage } from "@calcom/lib/webstorage";

const is24hLocalstorageKey = "timeOption.is24hClock";

const isBrowserLocaleHourCycle24h = (): boolean => {
  // Intl.DateTimeFormat with value=undefined uses local browser settings.
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const { hourCycle, hour12 } = formatter.resolvedOptions();
  if (hourCycle) return hourCycle === "h23" || hourCycle === "h24";
  if (typeof hour12 === "boolean") return !hour12;
  // Only recognises Latin AM/PM markers, so it misreads 12h locales such as ar, el, zh-TW and ko-KR.
  // Kept for engines that resolve neither hourCycle nor hour12.
  return !/M/i.test(formatter.format(0));
};

export enum TimeFormat {
  TWELVE_HOUR = "h:mma",
  TWENTY_FOUR_HOUR = "HH:mm",
}

export const setIs24hClockInLocalStorage = (is24h: boolean) =>
  localStorage.setItem(is24hLocalstorageKey, is24h.toString());

export const getIs24hClockFromLocalStorage = () => {
  const is24hFromLocalstorage = localStorage.getItem(is24hLocalstorageKey);

  if (is24hFromLocalstorage === null) return null;

  return is24hFromLocalstorage === "true";
};

export const getTimeFormatStringFromUserTimeFormat = (timeFormat: number | null | undefined): TimeFormat => {
  return timeFormat === 24 ? TimeFormat.TWENTY_FOUR_HOUR : TimeFormat.TWELVE_HOUR;
};

/**
 * Retrieves the browsers time format preference, checking local storage first
 * for a user set preference. If no preference is found, it will use the browser
 * locale to determine the time format and store it in local storage.
 */
export const isBrowserLocale24h = () => {
  const localStorageTimeFormat = getIs24hClockFromLocalStorage();
  // If time format is already stored in the browser then retrieve and return early
  if (localStorageTimeFormat === true) {
    return true;
  } else if (localStorageTimeFormat === false) {
    return false;
  }
  const is24h = isBrowserLocaleHourCycle24h();
  setIs24hClockInLocalStorage(is24h);
  return is24h;
};

/**
 * Returns the time format string based on whether the current set locale is 24h or 12h.
 */
export const detectBrowserTimeFormat = isBrowserLocale24h()
  ? TimeFormat.TWENTY_FOUR_HOUR
  : TimeFormat.TWELVE_HOUR;
