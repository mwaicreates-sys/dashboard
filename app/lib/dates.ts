// ============================================================
// Calendar helpers — day/week utilities for the Year view
// ============================================================

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

import { formatCurrencyCompact, formatCurrencyFull } from "./currency";

/** Compact money in the active display currency, e.g. "KSh 12.5k", "$34.5k". */
export function formatMoney(n: number): string {
  return formatCurrencyCompact(n);
}

/** Full money with separators in the active display currency, e.g. "KSh 12,500". */
export function formatMoneyFull(n: number): string {
  return formatCurrencyFull(n);
}

export interface WeekDay {
  date: string;
  label: string;
}

export interface YearWeek {
  weekNumber: number;
  /** First day of the period, always within the selected calendar year. */
  start: string;
  /** Last day of the period, always within the selected calendar year. */
  end: string;
  /** Monday → Sunday, clipped at the selected year's boundaries. */
  days: WeekDay[];
}

/**
 * Weeks of a calendar year. The first and last periods are clipped to the
 * calendar year so January 1 through December 31 are always represented.
 */
export function getWeeksOfYear(year: number): YearWeek[] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const weeks: YearWeek[] = [];
  const cursor = new Date(yearStart);
  let weekNumber = 1;

  while (cursor.getTime() <= yearEnd.getTime()) {
    const periodEnd = new Date(cursor);
    if (cursor.getTime() === yearStart.getTime()) {
      periodEnd.setDate(periodEnd.getDate() + (7 - periodEnd.getDay()) % 7);
    } else {
      periodEnd.setDate(periodEnd.getDate() + 6);
    }
    if (periodEnd.getTime() > yearEnd.getTime()) {
      periodEnd.setTime(yearEnd.getTime());
    }

    const days: WeekDay[] = [];
    const dayCursor = new Date(cursor);
    while (dayCursor.getTime() <= periodEnd.getTime()) {
      days.push({ date: toISODate(dayCursor), label: DAY_LABELS[dayCursor.getDay()] });
      dayCursor.setDate(dayCursor.getDate() + 1);
    }
    weeks.push({ weekNumber: weekNumber++, start: days[0].date, end: days[days.length - 1].date, days });
    cursor.setTime(dayCursor.getTime());
  }
  return weeks;
}

/** Monday → Sunday range containing a given date. */
export function getWeekRange(iso: string): { start: string; end: string } {
  const d = parseISODate(iso);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
  return { start: toISODate(d), end: toISODate(end) };
}

/** "Jan 5" */
export function shortMonthDay(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "Mon, Jan 5" (adds year when it differs from the reference year). */
export function shortDayLabel(iso: string, referenceYear?: number): string {
  const d = parseISODate(iso);
  const base = `${DAY_LABELS[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  if (referenceYear !== undefined && d.getFullYear() !== referenceYear) {
    return `${base}, ${d.getFullYear()}`;
  }
  return base;
}

/** "Today" / "Yesterday" / "Mon, Jan 5" (with year when different). */
export function relativeDayLabel(iso: string, today: string = todayISO()): string {
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  const referenceYear = Number(today.slice(0, 4));
  return shortDayLabel(iso, referenceYear);
}

/** "Jan 5 – Jan 11" (with year when the end falls in a different year). */
export function weekRangeLabel(start: string, end: string): string {
  const s = shortMonthDay(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return `${s} – ${shortMonthDay(end)}, ${Number(end.slice(0, 4))}`;
  }
  return `${s} – ${shortMonthDay(end)}`;
}