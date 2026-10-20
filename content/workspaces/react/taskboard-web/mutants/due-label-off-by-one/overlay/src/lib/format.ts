// Dates and names as people read them. Every date is formatted in UTC, the time zone the API's
// dates are in, so "Due today" means the same day on every machine.
import { todayISO } from "./clock";

const DAY_MS = 86_400_000;

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "2026-10-14" becomes "Oct 14". */
export function formatDue(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** "2026-09-15T09:30:00Z" becomes "Sep 15, 09:30". */
export function formatDateTime(isoTime: string): string {
  return dateTimeFormat.format(new Date(isoTime));
}

/** Whole calendar days from today to the date: 0 today, 1 tomorrow, -2 the day before yesterday. */
export function daysUntil(isoDate: string, today: string = todayISO()): number {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS) + 1;
}

/** "Due today", "Due tomorrow", "Due in 3 days", "Overdue by 1 day", "Overdue by 2 days". */
export function dueLabel(isoDate: string, today: string = todayISO()): string {
  const days = daysUntil(isoDate, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
}

/** "Ada Lovelace" becomes "AL", "Plato" becomes "P". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => word[0]!.toUpperCase()).join("");
}
