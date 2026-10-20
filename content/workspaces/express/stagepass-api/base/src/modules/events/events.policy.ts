// Who may see and change an event. Being logged in is not permission: these rules decide, and
// services call them, so every route that touches an event applies the same ones.
import type { AuthUser } from "../../http/auth.ts";
import type { Event } from "./events.repository.ts";

type EventOwnership = Pick<Event, "status" | "organizerId">;

/** Published and cancelled events are public. A draft is visible only to its organizer and admins. */
export function canViewEvent(user: AuthUser | null | undefined, event: EventOwnership): boolean {
  if (event.status !== "draft") return true;
  return user != null && (user.role === "admin" || user.id === event.organizerId);
}

/** Only the organizer who owns the event, or an admin, may change it or its ticket types. */
export function canEditEvent(user: AuthUser, event: EventOwnership): boolean {
  return user.role === "admin" || (user.role === "organizer" && user.id === event.organizerId);
}
