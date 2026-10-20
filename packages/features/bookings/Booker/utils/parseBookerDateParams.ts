const MONTH_PARAM_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PARAM_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

const padTwoDigits = (value: number): string => String(value).padStart(2, "0");

const formatLocalMonth = (date: Date): string => `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}`;

const formatLocalDate = (date: Date): string => `${formatLocalMonth(date)}-${padTwoDigits(date.getDate())}`;

// Date.UTC rolls an impossible day over (2026-02-31 becomes 2026-03-03), so the
// round trip is what rejects it.
const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Returns the `?month=` value when it is a real `YYYY-MM` month that is not in the past, otherwise null.
 * A past month has no bookable slots, so the Booker treats it like a malformed value.
 */
export const parseMonthParam = (value: string | null | undefined, now: Date = new Date()): string | null => {
  if (!value || !MONTH_PARAM_REGEX.test(value)) return null;
  // Zero-padded YYYY-MM strings sort in calendar order.
  if (value < formatLocalMonth(now)) return null;
  return value;
};

/**
 * Returns the `?date=` value when it is a real `YYYY-MM-DD` date that is not before today, otherwise null.
 */
export const parseDateParam = (value: string | null | undefined, now: Date = new Date()): string | null => {
  if (!value) return null;
  const match = DATE_PARAM_REGEX.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!isRealCalendarDate(Number(year), Number(month), Number(day))) return null;
  if (value < formatLocalDate(now)) return null;
  return value;
};
