/** Dates are ISO text (yyyy-mm-dd). Excel may hand a date back as a serial number: `isoDate` accepts both. */
export function isoDate(value: string | number | boolean): string {
  if (typeof value === 'number') {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

/** The date `days` working days later (Monday to Friday; public holidays are not known). */
export function addBusinessDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-12" → "12 November 2026", for message texts. Anything else is returned as it is. */
export function longDate(iso: string): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return found ? `${Number(found[3])} ${MONTHS[Number(found[2]) - 1] ?? found[2]} ${found[1]}` : iso;
}

/**
 * "2026-11-12" → "12 Nov 2026", the date as every screen shows it. With `thisYear` ("2026"), a date of that year is
 * "12 Nov": for lists, where the year is clear. Anything that is not a date is returned as it is.
 */
export function screenDate(iso: string, thisYear = ''): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!found || !MONTHS[Number(found[2]) - 1]) return iso;
  const day = `${Number(found[3])} ${MONTHS[Number(found[2]) - 1]!.slice(0, 3)}`;
  return found[1] === thisYear ? day : `${day} ${found[1]}`;
}

/**
 * A sentence with every yyyy-mm-dd in it written as the screen shows a date. A date inside a file name
 * ("2026-11-12_ci-report.csv") stays as it is. For texts saved by an earlier version and notes of the checks.
 */
export function datesInText(text: string): string {
  return text.replace(/(^|[^\w.-])(\d{4}-\d{2}-\d{2})(?![\w-]|\.\w|T\d)/g, (_all, before: string, date: string) => `${before}${screenDate(date)}`);
}

/**
 * A date of a report as yyyy-mm-dd: "2026-06-10 10:35:59", "10-06-2026", "10/06/2026 10:35" (day first), or the serial
 * number Excel keeps. '' when empty or not a date, so a check can say what it could not read.
 */
export function reportDate(value: string): string {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(text);
  if (dayFirst) return valid(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  if (/^\d{5}(\.\d+)?$/.test(text)) return isoDate(Math.floor(Number(text)));
  return '';
}

function valid(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

/** Whole days from one date to a later one (yyyy-mm-dd). NaN when one is not a date. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000);
}
