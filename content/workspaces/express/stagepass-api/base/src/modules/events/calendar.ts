// The .ics file behind "add to calendar" (RFC 5545). The template is read once, when the app
// is built, never per request. The ETag comes from the event's id and updated_at, so a repeat
// request costs one hash, and calendar apps get 304 Not Modified until the event changes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EventWithVenue } from "./events.repository.ts";

export type Calendar = {
  render(event: EventWithVenue, baseUrl: string): string;
  etag(event: Pick<EventWithVenue, "id" | "updatedAt">): string;
};

/** 2026-10-16T01:00:00.000Z becomes 20261016T010000Z. */
function icsTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Text values escape backslashes, semicolons, commas, and newlines. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes continue on the next line after a space, without splitting a character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char) > limit) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function loadCalendar(templateUrl = new URL("./calendar.template.ics", import.meta.url)): Calendar {
  const lines = readFileSync(templateUrl, "utf8").trimEnd().split(/\r?\n/);

  return {
    render(event, baseUrl) {
      const values: Record<string, string> = {
        uid: `event-${event.id}@stagepass.test`,
        stamp: icsTime(event.updatedAt),
        start: icsTime(event.startsAt),
        end: icsTime(event.endsAt),
        title: icsText(event.title),
        description: icsText(event.description),
        location: icsText(`${event.venue.name}, ${event.venue.address}, ${event.venue.city}`),
        url: `${baseUrl}/e/${event.slug}`,
        status: event.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
      };
      const filled = lines.map((line) => fold(line.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "")));
      return `${filled.join("\r\n")}\r\n`;
    },

    etag(event) {
      const digest = createHash("sha256").update(`${event.id}:${event.updatedAt.toISOString()}`).digest("base64url");
      return `"${digest.slice(0, 27)}"`;
    },
  };
}
