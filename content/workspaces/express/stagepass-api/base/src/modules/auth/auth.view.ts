// The view for auth: what clients see of a user and a session. Never the password hash.
import type { z } from "zod";
import { now } from "../../clock.ts";
import type { SessionResponse, UserResponse } from "./auth.schemas.ts";
import type { Session } from "./auth.service.ts";
import type { User } from "./users.repository.ts";

export function toUserJson(user: User): z.infer<typeof UserResponse> {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() };
}

export function toSessionJson(session: Session): z.infer<typeof SessionResponse> {
  return {
    tokenType: "Bearer",
    accessToken: session.accessToken,
    expiresIn: Math.ceil((session.accessTokenExpiresAt.getTime() - now().getTime()) / 1000),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
    user: toUserJson(session.user),
  };
}
