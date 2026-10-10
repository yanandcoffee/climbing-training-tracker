import { format, parseISO } from "date-fns";

/** Local 'YYYY-MM-DD' key for a Date (avoids UTC off-by-one). */
export function dateKey(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function parseKey(key: string): Date {
  return parseISO(key);
}

export function prettyDate(key: string): string {
  return format(parseKey(key), "EEEE, d MMM yyyy");
}

export function shortDate(key: string): string {
  return format(parseKey(key), "d MMM");
}

export function weekdayOf(key: string): number {
  return parseKey(key).getDay();
}

export function todayKey(): string {
  return dateKey(new Date());
}
